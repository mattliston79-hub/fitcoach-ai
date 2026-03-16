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

const SAVE_PLAN_TOOL = {
  name: 'save_plan',
  description: 'Save a structured training plan to the user\'s Plan page. Call this when the user confirms they want to save the plan built during conversation.',
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
                  exercise_name: { type: 'string' },
                  sets: { type: 'integer' },
                  reps: { type: 'integer' },
                  weight_kg: { type: 'number', description: 'Omit for bodyweight exercises or when not specified.' },
                  rest_secs: { type: 'integer' },
                  technique_cue: { type: 'string', description: 'One short technique cue.' },
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
      tools: [SAVE_GOAL_TOOL, SAVE_PLAN_TOOL],
    })

    // ── Tool use ──────────────────────────────────────────────────────────────
    if (response.stop_reason === 'tool_use') {
      const toolBlock = response.content.find(b => b.type === 'tool_use')

      let toolResult = { type: 'tool_result', tool_use_id: toolBlock?.id, content: 'Done.' }

      if (toolBlock && userId) {
        try {
          const supabase = createClient(
            process.env.VITE_SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
          )

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

            const rows = sessions.map(s => ({
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
          toolResult = { type: 'tool_result', tool_use_id: toolBlock?.id, content: 'Error saving to database.' }
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
        tools: [SAVE_GOAL_TOOL, SAVE_PLAN_TOOL],
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
