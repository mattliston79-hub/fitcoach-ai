import { supabase } from '../lib/supabase'

/**
 * Summary prompts — deliberately short (512 tokens max output).
 * The model is asked to return bullet points only, no prose.
 */
const FITZ_SUMMARY_PROMPT = `You are summarising a coaching conversation between a fitness coach called Fitz and a user.
Extract 3-5 bullet points capturing the most important things. Cover:
- Barriers or challenges the user mentioned
- Motivations and what matters to them
- How they were feeling (mood, energy, confidence)
- Any commitments or next steps agreed
- Progress or significant insights shared

Return ONLY a plain-text bulleted list. No preamble, no headers, no JSON. Start each bullet with "• ".`

const REX_SUMMARY_PROMPT = `You are summarising a training conversation between an AI personal trainer called Rex and a user.
Extract 3-5 bullet points capturing the most important things. Cover:
- Training preferences, interests, or dislikes discussed
- Any injuries, limitations, or health notes mentioned
- Exercise programmes or session plans discussed
- Technique questions or coaching cues given
- Key advice given or training commitments made

Return ONLY a plain-text bulleted list. No preamble, no headers, no JSON. Start each bullet with "• ".`

/**
 * Calls /api/chat to generate a 3-5 bullet summary of a conversation,
 * then saves it to the coach_conversations table.
 *
 * Minimum threshold: at least 4 messages (2 exchanges) before saving.
 * Silent on failure — memory is best-effort and must never block the user.
 *
 * @param {string} userId
 * @param {'fitz'|'rex'} persona
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<void>}
 */
export async function saveConversationSummary(userId, persona, messages) {
  if (!userId || !messages || messages.length < 4) return

  const systemPrompt = persona === 'rex' ? REX_SUMMARY_PROMPT : FITZ_SUMMARY_PROMPT

  // API requires the final message to be from the user
  const messagesForSummary =
    messages[messages.length - 1]?.role === 'user'
      ? messages
      : [...messages, { role: 'user', content: 'Please summarise the conversation above.' }]

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // keepalive: true allows the request to outlive a page unload
      keepalive: true,
      body: JSON.stringify({
        system: systemPrompt,
        messages: messagesForSummary,
        max_tokens: 512,
      }),
    })

    if (!response.ok) return

    const data = await response.json()
    const summary = data.reply?.trim()
    if (!summary) return

    await supabase.from('coach_conversations').insert({
      user_id: userId,
      persona,
      mode: 'open_chat',
      summary,
    })
  } catch {
    // Silent fail — never surface memory errors to the user
  }
}

/**
 * Fetches the last N conversation summaries for a given persona and
 * returns them as a formatted string ready for injection into a system prompt.
 *
 * Returns an empty string if no history exists (graceful degradation).
 *
 * @param {string} userId
 * @param {'fitz'|'rex'} persona
 * @param {number} limit
 * @returns {Promise<string>}
 */
export async function fetchConversationHistory(userId, persona, limit = 5) {
  if (!userId) return ''

  const { data } = await supabase
    .from('coach_conversations')
    .select('summary, created_at')
    .eq('user_id', userId)
    .eq('persona', persona)
    .not('summary', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!data || data.length === 0) return ''

  // Reverse so context reads chronologically (oldest → newest)
  const entries = [...data]
    .reverse()
    .map((row, i) => {
      const date = new Date(row.created_at).toISOString().slice(0, 10)
      return `Conversation ${i + 1} (${date}):\n${row.summary}`
    })
    .join('\n\n')

  return `=== PREVIOUS CONVERSATIONS WITH THIS USER (last ${data.length}) ===\n${entries}`
}
