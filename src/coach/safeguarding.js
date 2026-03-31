import Anthropic from '@anthropic-ai/sdk'

/**
 * Runs a mental health crisis pre-check on the last user message.
 * Uses Haiku with max_tokens:200 to classify the message as safe or unsafe.
 * Fails open — if the check errors for any reason, returns {safe: true} to
 * avoid blocking the user.
 *
 * @param {string} userMessage
 * @param {string} anthropicApiKey
 * @returns {Promise<{safe: true} | {safe: false, level: 1|2|3}>}
 */
export async function runSafeguardingCheck(userMessage, anthropicApiKey) {
  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey, timeout: 10_000 })

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: `You are a mental health safety classifier. Classify the user message into one of four levels. Respond with ONLY a JSON object — no other text, no markdown.

{"level": 0}  — No concern: normal conversation, fitness talk, general life topics, mild stress.
{"level": 1}  — Low mood or general struggle: 'I've been really low', 'I can't enjoy anything', 'Everything feels hard', 'I've been quite down lately'.
{"level": 2}  — Significant distress or hopelessness: 'I don't see the point', 'Nothing is getting better', 'I feel completely stuck and hopeless'.
{"level": 3}  — Self-harm or suicidal ideation: 'I've been hurting myself', 'I've been thinking about ending things', 'I don't want to be here anymore'.

If uncertain, choose the lower level. Only classify Level 3 for explicit self-harm or suicidal statements.`,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content.find(b => b.type === 'text')?.text?.trim() ?? ''
    const parsed = JSON.parse(text)
    const level = Number(parsed.level)

    if (!level || isNaN(level)) return { safe: true }
    return { safe: false, level: Math.min(Math.max(Math.round(level), 1), 3) }
  } catch {
    // Fail open — never block the user due to a safeguarding check error
    return { safe: true }
  }
}
