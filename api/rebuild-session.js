import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const REBUILD_SESSION_SYSTEM_PROMPT = `
You are Rex, the expert personal trainer for the Alongside app.
The user wants to rebuild a specific session in their 12-week programme.
They have provided a reason for why they want to rebuild it.

Your task:
1. Review the provided session JSON.
2. Review the user's feedback/reasoning for the rebuild.
3. Modify the session to meet their needs while retaining the core intent of the block.
4. Output the updated session JSON wrapped in [REBUILT_JSON]...[/REBUILT_JSON].
5. Do NOT include any other JSON or formatting outside of the tags.

Rules for the session JSON:
- It must maintain the same schema as the original session (title, session_type, duration_mins, purpose_note, warm_up_json, exercises_json, cool_down_json).
- If the user has a hard constraint (e.g., "no barbell"), you MUST replace all barbell exercises.
- Keep the title similar but appropriate for the new structure.
`

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { userId, sessionId, reason } = req.body

  if (!userId || !sessionId || !reason) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  try {
    // 1. Fetch the session to rebuild
    const { data: sessionData, error: sessionError } = await supabase
      .from('sessions_planned')
      .select('*')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single()

    if (sessionError || !sessionData) {
      throw new Error('Session not found')
    }

    // 2. Fetch user context to understand constraints (optional but helpful)
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('training_preferences')
      .eq('user_id', userId)
      .maybeSingle()

    // 3. Prompt Claude to rebuild the session
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const promptMsg = `
Here is the session I want you to rebuild:
\`\`\`json
${JSON.stringify({
  title: sessionData.title,
  session_type: sessionData.session_type,
  duration_mins: sessionData.duration_mins,
  purpose_note: sessionData.purpose_note,
  warm_up_json: sessionData.warm_up_json,
  exercises_json: sessionData.exercises_json,
  cool_down_json: sessionData.cool_down_json
}, null, 2)}
\`\`\`

User's reason for rebuilding:
"${reason}"

Please provide the rebuilt session JSON wrapped in [REBUILT_JSON]...[/REBUILT_JSON].
`

    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 4096,
      system: REBUILD_SESSION_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: promptMsg }],
    })

    const rawReply = response.content.find(b => b.type === 'text')?.text || ''
    
    // 4. Parse the rebuilt JSON
    const match = rawReply.match(/\[REBUILT_JSON\]([\s\S]*?)\[\/REBUILT_JSON\]/i)
    if (!match) {
      throw new Error('Failed to parse rebuilt JSON from AI response')
    }

    const rebuiltJson = JSON.parse(match[1].trim())

    // 5. Apply the rebuilt session to the target session and any matching future sessions in this block
    // We update the target session first
    const updatePayload = {
      title: rebuiltJson.title,
      session_type: rebuiltJson.session_type,
      duration_mins: rebuiltJson.duration_mins,
      purpose_note: rebuiltJson.purpose_note,
      warm_up_json: rebuiltJson.warm_up_json,
      exercises_json: rebuiltJson.exercises_json,
      cool_down_json: rebuiltJson.cool_down_json,
    }

    await supabase
      .from('sessions_planned')
      .update(updatePayload)
      .eq('id', sessionId)

    // 6. If this session belongs to a block, update identical sessions in subsequent weeks of the same block
    if (sessionData.programme_id && sessionData.block_number) {
       // Find sessions in the same block, with the same original title and day of week
       const { data: futureSessions } = await supabase
         .from('sessions_planned')
         .select('id')
         .eq('programme_id', sessionData.programme_id)
         .eq('block_number', sessionData.block_number)
         .eq('title', sessionData.title) // We match on the old title
         .gt('week_number', sessionData.week_number)
         
       if (futureSessions && futureSessions.length > 0) {
         const futureIds = futureSessions.map(s => s.id)
         await supabase
           .from('sessions_planned')
           .update(updatePayload)
           .in('id', futureIds)
       }
    }

    // 7. Save the user feedback to their preferences so Rex remembers it for future programmes
    if (reason) {
       const prefs = profile?.training_preferences || ''
       const newPrefs = prefs ? \`\${prefs}\\n\\nUser Feedback on \${new Date().toISOString().slice(0, 10)}: \${reason}\` : \`User Feedback on \${new Date().toISOString().slice(0, 10)}: \${reason}\`
       
       await supabase
         .from('user_profiles')
         .update({ training_preferences: newPrefs })
         .eq('user_id', userId)
    }

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('Rebuild session error:', err)
    return res.status(500).json({ error: err?.message ?? 'Internal server error' })
  }
}
