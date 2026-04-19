import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { MINDFULNESS_PRACTICES } from '../src/coach/mindfulnessKnowledge.js'
import { runSafeguardingCheck } from '../src/coach/safeguarding.js'
import { getSafeguardingResponse } from '../src/coach/safeguardingResponses.js'

/**
 * Parses [DELIVER_SCRIPT: key] and [ADD_MINDFULNESS: ...] markers out of an AI reply.
 * Returns clean display text plus structured data for each marker found.
 */
function parseMarkersFromReply(text) {
  let cleanText = text
  let scriptData = null
  let plannerAction = null

  const scriptMatch = cleanText.match(/\[DELIVER_SCRIPT:\s*(\w+)\]/i)
  if (scriptMatch) {
    const key = scriptMatch[1].toLowerCase()
    cleanText = cleanText.replace(scriptMatch[0], '').trim()
    const practice = MINDFULNESS_PRACTICES[key]
    if (practice) {
      scriptData = {
        key,
        name: practice.name,
        duration_mins: practice.duration_mins,
        brief_description: practice.brief_description,
        script: practice.script,
      }
    }
  }

  const plannerMatch = cleanText.match(/\[ADD_MINDFULNESS:[^\]]+\]/i)
  if (plannerMatch) {
    const raw = plannerMatch[0]
    const get = (k) => { const m = raw.match(new RegExp(`${k}=([^\\s\\]]+)`, 'i')); return m ? m[1] : null }
    const purposeMatch = raw.match(/purpose=(.+?)(?:\]|$)/i)

    // Extract practice key: named attribute first, then bare key after the colon
    let practiceKey = get('practice')?.toLowerCase() ?? null
    if (!practiceKey) {
      const bare = raw.match(/\[ADD_MINDFULNESS:\s*(\w+)/i)
      practiceKey = bare ? bare[1].toLowerCase() : null
    }
    // Validate against known keys
    if (practiceKey && !MINDFULNESS_PRACTICES[practiceKey]) practiceKey = null

    const practice = practiceKey ? MINDFULNESS_PRACTICES[practiceKey] : null
    const markerDuration = parseInt(get('duration') || '0', 10) || null

    plannerAction = {
      type:     'mindfulness',
      practice: practiceKey,
      date:     get('date'),
      duration: markerDuration ?? practice?.duration_mins ?? null,
      purpose:  purposeMatch ? purposeMatch[1].trim() : null,
    }
    cleanText = cleanText.replace(raw, '').trim()
  }

  return { cleanText, scriptData, plannerAction }
}

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

const BUILD_PROGRAMME_TOOL = {
  name: 'build_programme',
  description: 'Trigger full programme generation and save. Call this ONLY when the user confirms they want their multi-week training programme built and saved. The system will automatically generate the full programme with exercises using the 3-phase pipeline. Do NOT try to generate exercise details yourself — just call this tool.',
  input_schema: {
    type: 'object',
    properties: {
      confirmed: {
        type: 'boolean',
        description: 'Set to true when the user has confirmed they want their programme built.',
      },
    },
    required: ['confirmed'],
  },
}

const SAVE_PLAN_TOOL = {
  name: 'save_plan',
  description: 'Save individual one-off sessions to the user\'s Plan page. Use this for scheduling specific sessions (e.g. "add a kettlebell session tomorrow"), NOT for building a full multi-week programme (use build_programme for that).',
  input_schema: {
    type: 'object',
    properties: {
      sessions: {
        type: 'array',
        description: 'Array of planned sessions to save',
        items: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Session date in YYYY-MM-DD format',
            },
            session_type: {
              type: 'string',
              enum: ['kettlebell', 'hiit_bodyweight', 'yoga', 'pilates', 'plyometrics', 'coordination', 'flexibility', 'gym_strength'],
              description: 'Type of training session',
            },
            title: {
              type: 'string',
              description: 'Short session title, 5 words max',
            },
            duration_mins: {
              type: 'integer',
              description: 'Planned session duration in minutes',
            },
            purpose_note: {
              type: 'string',
              description: 'One sentence describing what this session achieves, ending with a full stop',
            },
            goal_id: {
              type: 'string',
              description: 'UUID of the goal this session supports. Use the exact goal ID from context. Omit if not linked to a specific goal.',
            },

            cardio_activity: {
              type: 'object',
              description: 'Use instead of exercises for continuous cardio (running, cycling, swimming, rowing).',
              properties: {
                activity: { type: 'string', description: 'run, ride, swim, row, walk' },
                warm_up: { type: 'object', properties: { duration_mins: { type: 'integer' }, description: { type: 'string' } } },
                main_activity: { type: 'object', properties: { duration_mins: { type: 'integer' }, focus_type: { type: 'string' }, focus_description: { type: 'string' }, rpe_target: { type: 'string' } } },
                cool_down: { type: 'object', properties: { duration_mins: { type: 'integer' }, description: { type: 'string' } } }
              }
            },
          },
          required: ['date', 'session_type', 'title', 'duration_mins', 'purpose_note'],
        },
      },
    },
    required: ['sessions'],
  },
}

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

function selectModel(persona, mode) {
  // Builder needs Sonnet for reliable structured exercise assignment
  if (persona === 'rex' && mode === 'programme_builder') {
    return 'claude-sonnet-4-6'
  }
  // Architect uses Haiku — clinical reasoning only, no exercise selection
  // All Fitz calls and Rex chat also use Haiku
  return 'claude-haiku-4-5-20251001'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const {
    system, messages, max_tokens = 4096, userId, skipTools,
    persona, mode = 'chat',
    userCountryCode = 'GB',
    conversationId = null,
    temperature = null,
  } = req.body

  if (!system || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: system, messages' })
  }

  // ── Supabase client (used for crisis lookup and tool calls) ──────────────
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  )

  // ── Crisis resource lookup ────────────────────────────────────────────────
  const { data: crisisRow } = await supabase
    .from('crisis_resources')
    .select('organisation, phone')
    .eq('country_code', userCountryCode)
    .maybeSingle()
  const crisisLineName   = crisisRow?.organisation ?? 'Samaritans'
  const crisisLineNumber = crisisRow?.phone        ?? '116 123'

  // ── Safeguarding pre-check ────────────────────────────────────────────────
  // Runs before every real chat call. Hard-stop signals return a fixed clinical
  // response immediately. Pass-through signals inject a prefix into the system
  // prompt so the main model handles them with appropriate guidance.
  let systemPromptPrefix = ''
  if (!skipTools) {
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')?.content
    if (lastUserMsg && typeof lastUserMsg === 'string') {
      const check = await runSafeguardingCheck(lastUserMsg, process.env.ANTHROPIC_API_KEY)

      // Fire-and-forget audit log — never awaited, never blocks the response
      supabase.from('safeguarding_flags').insert({
        user_id:           userId          ?? null,
        signal_type:       check.signal,
        confidence:        check.confidence,
        trigger_phrase:    check.trigger_phrase,
        persona:           persona         ?? null,
        country_code:      userCountryCode ?? null,
        crisis_line_shown: check.safe ? null : crisisLineName,
        conversation_id:   conversationId  ?? null,
      }).then(() => {}).catch(e => console.error('[safeguarding_flags]', e))

      if (!check.safe) {
        const reply = getSafeguardingResponse(check.signal, persona, crisisLineName, crisisLineNumber)

        if (reply) {
          // Hard stop — CRISIS, SIGNIFICANT, or CARDIAC
          return res.status(200).json({
            reply,
            safeguardingTriggered: true,
            safeguardingLevel: check.signal,
          })
        }

        // Pass-through signals — inject guidance prefix into system prompt
        if (check.signal === 'MENTAL_HEALTH_LOW') {
          systemPromptPrefix =
            'SAFEGUARDING FLAG: MENTAL_HEALTH_LOW\n' +
            'The user message contains a low-mood signal. Before any other ' +
            'content: acknowledge warmly and directly, validate without ' +
            'probing, briefly suggest speaking to their GP or a counsellor. ' +
            'Then, only if the user continues, return to the session.\n\n'
        }
        if (check.signal === 'PHYSICAL_INJURY') {
          systemPromptPrefix =
            'SAFEGUARDING FLAG: PHYSICAL_INJURY\n' +
            'The user message contains a pain signal. Before any training ' +
            'content: acknowledge the pain directly, advise stopping the ' +
            'current activity, direct to a physiotherapist. If severe, ' +
            'direct to GP.\n\n'
        }
      }
    }
  }

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000 })

    // Allow up to 8192 — Phase 3 of the plan pipeline needs room for a full programme JSON.
    // skipTools=true is passed by makeClaudeCall (Phase 1/3 JSON generation) to prevent
    // Claude mistaking the phase prompt for a user chat message and calling a tool.
    const firstCallTokens = Math.min(Number(max_tokens) || 1024, 8192)
    const tools = skipTools ? [] : [SAVE_GOAL_TOOL, SAVE_PLAN_TOOL, BUILD_PROGRAMME_TOOL]
    const response = await anthropic.messages.create({
      model: selectModel(persona, mode),
      max_tokens: firstCallTokens,
      system: [{ type: 'text', text: systemPromptPrefix + system, cache_control: { type: 'ephemeral' } }],
      messages,
      ...(tools.length > 0 ? { tools } : {}),
      ...(temperature !== null ? { temperature } : {}),
    })

    console.log(`[chat] model=${selectModel(persona, mode)} stop=${response.stop_reason} in=${response.usage?.input_tokens} out=${response.usage?.output_tokens}`)

    // ── Tool use ──────────────────────────────────────────────────────────────
    if (response.stop_reason === 'tool_use') {
      const toolBlock = response.content.find(b => b.type === 'tool_use')
      const planBuildTriggered = toolBlock?.name === 'build_programme'

      let toolResult = { type: 'tool_result', tool_use_id: toolBlock?.id, content: 'Done.' }

      if (toolBlock && userId) {
        try {
          // ── build_programme ───────────────────────────────────────────────
          // Plan generation happens client-side via generateRexPlan (3-phase pipeline).
          // This tool call is just a confirmation signal — no server-side DB work.
          if (toolBlock.name === 'build_programme') {
            toolResult = {
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: 'Programme generation triggered. The client will now run the 3-phase pipeline to build and save the full programme.',
            }
          }

          // ── save_goal ─────────────────────────────────────────────────────
          if (toolBlock.name === 'save_goal') {
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

            toolResult = { type: 'tool_result', tool_use_id: toolBlock.id, content: 'Goal saved.' }
          }

          // ── save_plan ─────────────────────────────────────────────────────
          if (toolBlock.name === 'save_plan') {
            const { sessions } = toolBlock.input
            if (!Array.isArray(sessions) || sessions.length === 0) {
              toolResult = { type: 'tool_result', tool_use_id: toolBlock?.id, content: 'Error: No sessions provided.' }
            } else {
              // We pass the raw session spec back to the client to orchestrate the pipeline
              res.__singleSessionTriggered = sessions
              toolResult = { 
                type: 'tool_result', 
                tool_use_id: toolBlock?.id, 
                content: 'Confirmed. The client application will now use the Architect and Builder to generate the structured exercises for this session in the background.' 
              }
            }
          }

        } catch (dbErr) {
          console.error(`${toolBlock.name} DB error:`, dbErr)
          const errDetail = dbErr?.message || dbErr?.code || JSON.stringify(dbErr)
          toolResult = { type: 'tool_result', tool_use_id: toolBlock?.id, content: `Error saving to database: ${errDetail}` }
          // Expose the raw error to the client for debugging
          res.__dbError = errDetail
        }
      }

      // Send tool_result back to get the coach's confirmatory reply
      // 1024 tokens is plenty for a short confirmation message
      const followUp = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages: [
          ...messages,
          { role: 'assistant', content: response.content },
          { role: 'user',      content: [toolResult] },
        ],
        tools: [SAVE_GOAL_TOOL, SAVE_PLAN_TOOL],
      })

      const rawReply = followUp.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('')

      const { cleanText: followUpText, scriptData: fuScript, plannerAction: fuPlanner } = parseMarkersFromReply(rawReply)
      return res.status(200).json({
        reply: followUpText,
        ...(planBuildTriggered && { planBuildTriggered: true }),
        ...(res.__singleSessionTriggered && { singleSessionTriggered: res.__singleSessionTriggered }),
        ...(fuScript    && { scriptData:    fuScript }),
        ...(fuPlanner   && { plannerAction: fuPlanner }),
        ...(res.__dbError && { _dbError: res.__dbError }),
      })
    }

    // ── Normal text reply ─────────────────────────────────────────────────────
    const rawReply = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    const { cleanText, scriptData, plannerAction } = parseMarkersFromReply(rawReply)
    return res.status(200).json({
      reply: cleanText,
      ...(scriptData    && { scriptData }),
      ...(plannerAction && { plannerAction }),
    })

  } catch (err) {
    console.error('Chat API error:', err)
    return res.status(500).json({ error: err?.message ?? 'Internal server error' })
  }
}
