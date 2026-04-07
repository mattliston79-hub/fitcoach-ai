import Anthropic from '@anthropic-ai/sdk'

/**
 * Runs a safeguarding pre-check on the last user message.
 * Detects mental health and physical safety signals.
 * Uses Haiku with max_tokens:150 to classify the message.
 * Fails open — if the check errors for any reason, returns {safe: true} to
 * avoid blocking the user.
 *
 * @param {string} userMessage
 * @param {string} anthropicApiKey
 * @returns {Promise<{safe: boolean, signal: string, confidence: number, trigger_phrase: string|null}>}
 */
export async function runSafeguardingCheck(userMessage, anthropicApiKey) {
  try {
    const anthropic = new Anthropic({ apiKey: anthropicApiKey, timeout: 10_000 })

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      system: `You are a safety classifier for a fitness and wellbeing app.
Your only job is to detect whether a user message contains a
safeguarding signal requiring an immediate safety response.
Return ONLY valid JSON. No other text.
{
  "signal": "NONE"|"MENTAL_HEALTH_LOW"|"MENTAL_HEALTH_SIGNIFICANT"
           |"MENTAL_HEALTH_CRISIS"|"PHYSICAL_CARDIAC"|"PHYSICAL_INJURY",
  "confidence": 0.0 to 1.0,
  "trigger_phrase": "exact words that triggered this or null"
}
MENTAL_HEALTH_LOW: low mood, feeling flat, struggling, not enjoying things.
MENTAL_HEALTH_SIGNIFICANT: hopelessness, nothing getting better, pointless.
MENTAL_HEALTH_CRISIS: self-harm (current or recent), suicidal ideation,
  not wanting to be here, intent to harm self. When in doubt between
  SIGNIFICANT and CRISIS, always choose CRISIS.
PHYSICAL_CARDIAC: chest pain or tightness, arm or jaw pain during exercise,
  sudden breathlessness at rest, palpitations.
PHYSICAL_INJURY: sharp or sudden pain, new or worsening joint pain,
  pain that stops movement.
NONE: no safeguarding signal.`,
      messages: [{ role: 'user', content: userMessage }],
    })

    const text = response.content.find(b => b.type === 'text')?.text?.trim() ?? ''
    const parsed = JSON.parse(text)
    const signal = parsed.signal ?? 'NONE'
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0
    const trigger_phrase = parsed.trigger_phrase ?? null

    const safe = signal === 'NONE'
    return { safe, signal, confidence, trigger_phrase }
  } catch (err) {
    // Fail open — never block the user due to a safeguarding check error
    console.error('[safeguarding] runSafeguardingCheck error:', err?.message ?? err)
    return { safe: true, signal: 'NONE', confidence: 0, trigger_phrase: null }
  }
}
