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
 *
 * The Anthropic client is instantiated inside the handler (not at module level)
 * so it is only ever created in the Node.js serverless runtime, never at
 * module-evaluation time in any other context.
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

  // Instantiated here so it only runs inside the serverless Node.js runtime.
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: Math.min(Number(max_tokens) || 1024, 8192),
    system,
    messages,
    tools: [SAVE_GOAL_TOOL],
  })

  // Handle save_goal tool call when userId is available
  if (userId && response.stop_reason === 'tool_use') {
    const toolBlock = response.content.find(b => b.type === 'tool_use' && b.name === 'save_goal')
    if (toolBlock) {
      const { goal_statement, domain, coach, milestones } = toolBlock.input
      const supabase = createClient(
        process.env.VITE_SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      )

      const { data: goal } = await supabase
        .from('goals')
        .insert({ user_id: userId, goal_statement, domain, coach, status: 'active' })
        .select('id')
        .single()

      if (goal?.id) {
        const milestoneRows = milestones.map((text, i) => ({
          goal_id: goal.id,
          user_id: userId,
          text,
          order_index: i,
          completed: false,
        }))
        await supabase.from('goal_milestones').insert(milestoneRows)
      }
    }
  }

  // Extract text reply — skip tool_use blocks
  const reply = response.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')

  return res.status(200).json({ reply })
}
