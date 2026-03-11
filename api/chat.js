import Anthropic from '@anthropic-ai/sdk'

/**
 * POST /api/chat
 *
 * Body: {
 *   system:   string  — assembled system prompt (context block + persona prompt)
 *   messages: Array<{ role: 'user' | 'assistant', content: string }>
 * }
 *
 * Response: { reply: string }
 *
 * The Anthropic client is instantiated inside the handler (not at module level)
 * so it is only ever created in the Node.js serverless runtime, never at
 * module-evaluation time in any other context.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { system, messages, max_tokens = 1024 } = req.body

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
  })

  const reply = response.content[0]?.text ?? ''
  return res.status(200).json({ reply })
}
