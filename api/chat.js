import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { MINDFULNESS_PRACTICES } from '../src/coach/mindfulnessKnowledge.js'
import { runSafeguardingCheck } from '../src/coach/safeguarding.js'
import { getSafeguardingResponse } from '../src/coach/safeguardingResponses.js'

// Service-role client for server-side writes (safeguarding logs, etc.)
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

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
            exercises: {
              type: 'array',
              description: 'Exercises for this session',
              items: {
                type: 'object',
                properties: {
                  exercise_id: { type: 'string', description: 'UUID of the exercise from the database, if known. Omit for warm-up/cool-down movements without a DB entry.' },
                  exercise_name: { type: 'string' },
                  section: { type: 'string', enum: ['warm_up', 'main', 'cool_down'], description: 'Which part of the session this exercise belongs to.' },
                  sets: { type: 'integer' },
                  reps: { type: 'integer' },
                  weight_kg: { type: 'number', description: 'Omit for bodyweight exercises or when not specified.' },
                  rest_secs: { type: 'integer' },
                  technique_cue: { type: 'string', description: '2-3 sentences explaining how to perform the movement.' },
                  benefit: { type: 'string', description: 'One sentence explaining what this exercise develops or achieves.' },
                },
                required: ['exercise_name', 'sets', 'reps', 'rest_secs'],
              },
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
    crisisLineName = null, crisisLineNumber = null,
    conversationId = null, userCountryCode = null,
  } = req.body

  let systemPromptPrefix = ''

  if (!system || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: system, messages' })
  }

  // ── Safeguarding pre-check ────────────────────────────────────────────────
  // Run before every real chat call (not programme generation pipeline phases).
  // Crisis/cardiac signals return a fixed response immediately — the main
  // Anthropic call is never made. LOW/INJURY signals pass through with a
  // system prompt flag injected.
  if (!skipTools) {
    const lastUserMsg = [...messages].reverse()
      .find(m => m.role === 'user')?.content
    if (lastUserMsg && typeof lastUserMsg === 'string') {
      const check = await runSafeguardingCheck(
        lastUserMsg, process.env.ANTHROPIC_API_KEY)

      // Log every signal (fire-and-forget — do not await)
      supabaseAdmin.from('safeguarding_flags').insert({
        user_id: userId,
        signal_type: check.signal,
        confidence: check.confidence,
        trigger_phrase: check.trigger_phrase,
        persona,
        country_code: userCountryCode,
        conversation_id: conversationId ?? null
      }).then().catch(e => console.error('[safeguarding_flags insert]', e))

      if (!check.safe) {
        const reply = getSafeguardingResponse(
          check.signal, persona, crisisLineName, crisisLineNumber)

        if (reply) {
          // Hard stop — crisis or cardiac signal
          return res.status(200).json({
            reply,
            safeguardingTriggered: true,
            safeguardingLevel: check.signal,
          })
        }

        // Pass-through signal (LOW or INJURY) — inject flag into system prompt
        if (check.signal === 'MENTAL_HEALTH_LOW') {
          systemPromptPrefix =
            'SAFEGUARDING FLAG: MENTAL_HEALTH_LOW\n' +
            'The user message contains a low-mood signal. Before any other ' +
            'content: acknowledge warmly and directly, validate without ' +
            'probing, briefly suggest speaking to their GP or a counsellor.' +
            ' Then, only if the user continues, return to the session.\n\n'
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
    })

    console.log(`[chat] model=${selectModel(persona, mode)} stop=${response.stop_reason} in=${response.usage?.input_tokens} out=${response.usage?.output_tokens}`)

    // ── Tool use ──────────────────────────────────────────────────────────────
    if (response.stop_reason === 'tool_use') {
      const toolBlock = response.content.find(b => b.type === 'tool_use')
      const planBuildTriggered = toolBlock?.name === 'build_programme'

      let toolResult = { type: 'tool_result', tool_use_id: toolBlock?.id, content: 'Done.' }

      if (toolBlock && userId) {
        try {
          const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
          )

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

            // Enrich each exercise with a real exercise_id + metadata via name lookup.
            // All lookups run in parallel across every exercise in every session.
            const enrichedSessions = await Promise.all(sessions.map(async s => {
              const enrichedExercises = await Promise.all((s.exercises || []).map(async ex => {
                const exName = (ex.exercise_name || ex.name || '').trim()
                if (!exName) return { ...ex, exercise_id: null }

                const { data: match } = await supabase
                  .from('exercises')
                  .select('id, name, gif_url, description_start, description_move, description_avoid, muscles_primary')
                  .ilike('name', exName)
                  .limit(1)
                  .maybeSingle()

                if (match) {
                  return {
                    ...ex,
                    exercise_id:       match.id,
                    exercise_name:     match.name,
                    gif_url:           match.gif_url           || null,
                    description_start: match.description_start || null,
                    description_move:  match.description_move  || null,
                    description_avoid: match.description_avoid || null,
                    muscles_primary:   match.muscles_primary   ?? [],
                  }
                }

                console.log(`[SAVE_PLAN NO MATCH]: ${exName}`)
                return { ...ex, exercise_id: null }
              }))
              return { ...s, exercises: enrichedExercises }
            }))

            // Validate goal_ids — Rex may hallucinate UUIDs. Check each against the DB
            // and null out any that don't exist, to avoid FK constraint failures.
            const validatedSessions = await Promise.all(enrichedSessions.map(async s => {
              if (!s.goal_id) return s
              const { data: goalRow } = await supabase
                .from('goals')
                .select('id')
                .eq('id', s.goal_id)
                .eq('user_id', userId)
                .maybeSingle()
              return { ...s, goal_id: goalRow ? s.goal_id : null }
            }))

            // Normalise session_type — Fitz sometimes saves mindfulness sessions as 'yoga',
            // 'pilates', or 'flexibility'. If the practice_type is a known mindfulness
            // practice key, override session_type to 'mindfulness'.
            const YOGA_LIKE_TYPES = new Set(['yoga', 'pilates', 'flexibility'])
            const normalisedSessions = validatedSessions.map(s => {
              if (
                YOGA_LIKE_TYPES.has(s.session_type) &&
                s.practice_type &&
                MINDFULNESS_PRACTICES[s.practice_type]
              ) {
                return { ...s, session_type: 'mindfulness' }
              }
              return s
            })

            const rows = normalisedSessions.map(s => ({
              user_id:        userId,
              date:           s.date,
              session_type:   s.session_type,
              title:          s.title,
              duration_mins:  s.duration_mins,
              purpose_note:   s.purpose_note,
              goal_id:        s.goal_id || null,
              exercises_json: s.exercises || [],
              status:         'planned',
            }))

            const { error: planError } = await supabase.from('sessions_planned').insert(rows)
            if (planError) throw planError

            toolResult = { type: 'tool_result', tool_use_id: toolBlock.id, content: `Plan saved. ${rows.length} session(s) added.` }
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
