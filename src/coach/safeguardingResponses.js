/**
 * Returns a fixed safeguarding response based on the signal and persona.
 * These responses are pre-written — do not let the AI generate them.
 * They are returned directly to the client without going through the main
 * Anthropic call.
 *
 * Pass-through signals (MENTAL_HEALTH_LOW, PHYSICAL_INJURY, NONE) return null —
 * the main model handles these with a system prompt prefix injected by api/chat.js.
 *
 * @param {string} signal - MENTAL_HEALTH_CRISIS | MENTAL_HEALTH_SIGNIFICANT |
 *                          PHYSICAL_CARDIAC | MENTAL_HEALTH_LOW | PHYSICAL_INJURY | NONE
 * @param {string|null} persona - 'fitz' | 'rex' | null
 * @param {string|null} crisisLineName - e.g. 'Samaritans'
 * @param {string|null} crisisLineNumber - e.g. '116 123'
 * @returns {string|null}
 */
export function getSafeguardingResponse(signal, persona, crisisLineName, crisisLineNumber) {
  const name   = crisisLineName   || 'a crisis line'
  const number = crisisLineNumber || ''
  const line   = number ? `${name} on ${number}` : name

  switch (signal) {
    case 'MENTAL_HEALTH_CRISIS':
      return `Thank you for trusting me with that. What you have shared matters, and I want to make sure you get the right support right now. Please reach out to ${line}. If you are in immediate danger, please call emergency services now. I am not able to provide the support you need in this moment, but the people at ${name} can. Please make that call.`

    case 'MENTAL_HEALTH_SIGNIFICANT':
      return `I am glad you said that, and I want to take it seriously. What you are describing sounds really hard. Please speak to your GP as soon as you can, today if possible. If things feel urgent, ${name} is available on ${number || 'their helpline'}. Please take care of yourself. The training can wait.`

    case 'PHYSICAL_CARDIAC':
      return `What you are describing needs urgent attention. Please stop exercising immediately and call emergency services now. Chest or arm pain during exercise must always be assessed urgently. Please make that call now.`

    case 'MENTAL_HEALTH_LOW':
    case 'PHYSICAL_INJURY':
    case 'NONE':
    default:
      return null
  }
}
