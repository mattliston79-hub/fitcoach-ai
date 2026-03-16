import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/chat
 *
 * Body: {
 *   system:   string  — assembled system prompt (context block + persona prompt)
 *   messages: Array<{ role: 'user' | 'assistant', content: string }>
 *   userId:   string  (optional) — required for save_goal tool execution
 * }
 *
 * Response: { reply: string }
 */

const SAVE_GOAL_TOOL = {
  name: 'save_goal',
  description: 'Save a newly co-created goal and its milestones to the database. Call this when the user has confirmed their goal statement and milestones.',
  input_schema: {
    type: 'object',
    properties: {
      goal_statement: {
        type: 'string',
        description: "The goal in the user's own words, lightly tidied for clarity",
      },
      domain: {
        type: 'string',
        enum: ['physical', 'emotional', 'social'],
        description: 'The primary wellbeing domain this goal belongs to',
      },
      coach: {
        type: 'string',
        enum: ['fitz', 'rex'],
        description: 'Which coach set this goal',
      },
      milestones: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of 3-5 milestone step descriptions, in order',
      },
    },
    required: ['goal_statement', 'domain', 'coach', 'milestones'],
  },
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { system, messages, max_tokens = 1024, userId } = req.body

  if (!system || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: system, messages' })
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: Math.min(Number(max_tokens) || 1024, 8192),
      system,
      messages,
      tools: [SAVE_GOAL_TOOL],
    })

    // ── Tool use: save_goal ───────────────────────────────────────────────────
    if (response.stop_reason === 'tool_use') {
      const toolBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'save_goal')

      let toolResult = { type: 'tool_result', tool_use_id: toolBlock?.id, content: 'Goal saved.' }

      if (toolBlock && userId) {
        try {
          const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
          )
          const { goal_statement, domain, coach, milestones } = toolBlock.input

          const { data: goal, error: goalError } = await supabase
            .from('goals')
            .insert({ user_id: userId, goal_statement, domain, coach, status: 'active' })
            .select('id')
            .single()

          if (goalError) throw goalError

          if (goal?.id) {
            const milestoneRows = milestones.map((text, i) => ({
              goal_id: goal.id,
              user_id: userId,
              text,
              order_index: i,
              completed: false,
            }))
            const { error: msError } = await supabase.from('goal_milestones').insert(milestoneRows)
            if (msError) throw msError
          }
        } catch (dbErr) {
          console.error('save_goal DB error:', dbErr)
          toolResult = { type: 'tool_result', tool_use_id: toolBlock?.id, content: 'Error saving goal.' }
        }
      }

      // Send tool_result back to get the coach's confirmatory reply
      const followUp = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: Math.min(Number(max_tokens) || 1024, 8192),
        system,
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user',      content: [toolResult] },
        ],
        tools: [SAVE_GOAL_TOOL],
      })

      const reply = followUp.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')

      return res.status(200).json({ reply })
    }

    // ── Normal text reply ─────────────────────────────────────────────────────
    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    return res.status(200).json({ reply })

  } catch (err) {
    console.error('Chat API error:', err)
    return res.status(500).json({ error: err?.message ?? 'Internal server error' })
  }
}
