import { buildContext } from './buildContext'
import { FITZ_SYSTEM_PROMPT } from './systemPrompt'
import { REX_SYSTEM_PROMPT } from './trainerPrompt'

/**
 * Calls /api/chat with the given system prompt + live context block + messages.
 * Returns the assistant's reply text.
 *
 * @param {string} systemPrompt - The persona's base system prompt
 * @param {string} userId       - The authenticated user's UUID
 * @param {Array<{role: string, content: string}>} messages - Conversation history
 * @returns {Promise<string>} The assistant's reply
 */
async function callChatApi(systemPrompt, userId, messages) {
  const contextBlock = await buildContext(userId)

  const system = `${contextBlock}\n\n${systemPrompt}`

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
 * @returns {Promise<string>}
 */
export async function askFitz(userId, messages) {
  return callChatApi(FITZ_SYSTEM_PROMPT, userId, messages)
}

/**
 * Sends a message to Rex (the AI trainer) and returns the reply.
 *
 * @param {string} userId
 * @param {Array<{role: string, content: string}>} messages
 * @returns {Promise<string>}
 */
export async function askRex(userId, messages) {
  return callChatApi(REX_SYSTEM_PROMPT, userId, messages)
}
