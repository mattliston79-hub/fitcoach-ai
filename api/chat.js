import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * POST /api/chat
 *
 * Body: {
 *   system:   string  — assembled system prompt (context block + persona prompt)
 *   messages: Array<{ role: 'user' | 'assistant', content: string }>
 * }
 *
 * Response: { reply: string }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { system, messages } = req.body

  if (!system || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing required fields: system, messages' })
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system,
    messages,
  })

  const reply = response.content[0]?.text ?? ''
  return res.status(200).json({ reply })
}
