import { buildContext } from './buildContext'
import { FITZ_SYSTEM_PROMPT } from './systemPrompt'
import { REX_SYSTEM_PROMPT } from './trainerPrompt'

/**
 * Calls /api/chat with the given system prompt + live context block + messages.
 * Returns the assistant's reply text.
 *
 * @param {string} systemPrompt
 * @param {string} userId
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} mode - conversation mode injected into the context block
 * @returns {Promise<string>}
 */
async function callChatApi(systemPrompt, userId, messages, mode = 'open_chat') {
  const contextBlock = await buildContext(userId)

  const system = `Conversation mode: ${mode}\n\n${contextBlock}\n\n${systemPrompt}`

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Chat API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  return data.reply
}

/**
 * Sends a message to Fitz (the AI coach) and returns the reply.
 *
 * @param {string} userId
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} [mode]
 * @returns {Promise<string>}
 */
export async function askFitz(userId, messages, mode = 'open_chat') {
  return callChatApi(FITZ_SYSTEM_PROMPT, userId, messages, mode)
}

/**
 * Sends a message to Rex (the AI trainer) and returns the reply.
 *
 * @param {string} userId
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} [mode]
 * @returns {Promise<string>}
 */
export async function askRex(userId, messages, mode = 'open_chat') {
  return callChatApi(REX_SYSTEM_PROMPT, userId, messages, mode)
}

/**
 * Extracts the primary fitness goal from a completed onboarding conversation.
 * Returns the goal as a plain string.
 *
 * @param {Array<{role: string, content: string}>} messages - full conversation history
 * @returns {Promise<string>}
 */
export async function extractGoal(messages) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `You are a data extraction assistant. Read the coaching conversation below and extract the single primary fitness goal the user has committed to. Return ONLY valid JSON with no other text, markdown, or explanation:
{"goal": "the user's goal as a clear first-person statement, e.g. 'Run a 5k without stopping by the end of summer'"}`,
      messages,
    }),
  })

  if (!response.ok) throw new Error('Failed to extract goal from conversation')

  const data = await response.json()

  try {
    // Strip any accidental markdown code fences before parsing
    const cleaned = data.reply.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned).goal
  } catch {
    // Fallback: return the raw reply if JSON parsing fails
    return data.reply.trim()
  }
}
