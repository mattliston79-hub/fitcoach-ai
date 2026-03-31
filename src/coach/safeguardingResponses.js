/**
 * Returns a fixed safeguarding response based on the crisis level and persona.
 * These responses are pre-written by the clinical team — do not let the AI
 * generate them. They are returned directly to the client without going through
 * the main Anthropic call.
 *
 * @param {number} level - 1, 2, or 3
 * @param {string|null} persona - 'fitz' | 'rex' | null (defaults to fitz)
 * @param {string|null} crisisLineName - e.g. 'Samaritans'
 * @param {string|null} crisisLineNumber - e.g. '116 123'
 * @returns {string|null} The response text, or null if level is unrecognised
 */
export function getSafeguardingResponse(level, persona, crisisLineName, crisisLineNumber) {
  const name   = crisisLineName   || 'a crisis line'
  const number = crisisLineNumber || ''

  const responses = {
    fitz: {
      1: "That sounds really hard — thank you for sharing that with me. It might be worth having a chat with your GP or a counsellor — they're much better placed to support you with this than I am. How are you feeling about reaching out to someone?",
      2: `I'm noticing what you're sharing sounds like more than a difficult week — it sounds like you're really struggling. Please do speak to your GP, and if things feel very dark, ${name}${number ? ` is available on ${number}` : ''}. You don't have to feel this way alone.`,
      3: `What you've just shared matters, and I'm glad you told me. Please call ${name}${number ? ` on ${number}` : ''} right now — they're there for exactly this, and they want to hear from you. You don't have to go through this alone.`,
    },
    rex: {
      1: "That sounds tough — thank you for sharing that. Fitz is much better placed to support you with this than I am. For now, it might be worth speaking to your GP too. Want to switch to Fitz?",
      2: `I can hear that things are really difficult right now. Please speak to your GP, and if things feel very dark, ${name}${number ? ` is available on ${number}` : ''}. This is beyond what I can help with — please reach out.`,
      3: `Please call ${name}${number ? ` on ${number}` : ''} right now. They're there for exactly this, and they want to hear from you.`,
    },
  }

  const personaKey = persona === 'rex' ? 'rex' : 'fitz'
  return responses[personaKey]?.[level] ?? null
}
