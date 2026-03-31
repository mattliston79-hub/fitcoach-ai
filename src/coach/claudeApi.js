import { buildContext } from './buildContext'
import { FITZ_SYSTEM_PROMPT } from './systemPrompt'
import { REX_SYSTEM_PROMPT } from './trainerPrompt'
import { supabase } from '../lib/supabase'

/**
 * Minimal Claude call — sends a system prompt + single user message to /api/chat.
 * Used by generateRexPlan (rexOrchestrator) where context is already embedded in
 * the system prompt; no additional buildContext injection is performed here.
 *
 * @param {string} systemPrompt
 * @param {string} userMessage
 * @param {number} [maxTokens=3000]
 * @returns {Promise<string>} The assistant's reply text
 */
export async function makeClaudeCall(systemPrompt, userMessage, maxTokens = 3000, opts = {}) {
  const { persona = null, mode = null } = opts
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
      max_tokens: maxTokens,
      skipTools:  true,   // Phase 1/3 are pure JSON generation — no tool calls needed
      ...(persona && { persona }),
      ...(mode    && { mode }),
    }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Chat API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  return data.reply
}

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
async function callChatApi(systemPrompt, userId, messages, mode = 'open_chat', persona = null) {
  const { contextString: contextBlock, crisisLineName, crisisLineNumber } = await buildContext(userId, persona, messages)
  const today = new Date().toISOString().slice(0, 10)

  const system = `Today's date: ${today}\nConversation mode: ${mode}\n\n${contextBlock}\n\n${systemPrompt}`

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, userId, max_tokens: 4096, persona, crisisLineName, crisisLineNumber }),
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText)
    throw new Error(`Chat API error ${response.status}: ${errorText}`)
  }

  const data = await response.json()
  return data
}

/**
 * Sends a message to Fitz and returns the full response object:
 * { reply, scriptData?, plannerAction? }
 *
 * @param {string} userId
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} [mode]
 * @returns {Promise<{reply: string, scriptData?: object, plannerAction?: object}>}
 */
export async function askFitz(userId, messages, mode = 'open_chat') {
  return callChatApi(FITZ_SYSTEM_PROMPT, userId, messages, mode, 'fitz')
}

/**
 * Sends a message to Rex (the AI trainer) and returns the reply string.
 *
 * @param {string} userId
 * @param {Array<{role: string, content: string}>} messages
 * @param {string} [mode]
 * @returns {Promise<{reply: string, planBuildTriggered?: boolean}>}
 */
export async function askRex(userId, messages, mode = 'open_chat') {
  return callChatApi(REX_SYSTEM_PROMPT, userId, messages, mode, 'rex')
}

/**
 * Sends a message to Fitz in wellbeing check-in mode. Returns the reply string.
 */
export async function askFitzWellbeing(userId, messages) {
  const data = await callChatApi(FITZ_SYSTEM_PROMPT, userId, messages, 'wellbeing_checkin', 'fitz')
  return data.reply
}

/**
 * Extracts all structured onboarding data from a completed onboarding conversation
 * in a single API call. Returns goals (with milestones), profile fields, and
 * notification preferences ready to be saved to Supabase.
 *
 * @param {Array<{role: string, content: string}>} messages - full conversation history
 * @returns {Promise<{goals: Array, profile: Object, notifications: Object}>}
 */
export async function extractOnboardingData(messages) {
  // The API requires the final message to be from the user.
  // Only append the extraction prompt when the last message is from the assistant —
  // appending it unconditionally would create an invalid double-user-message if the
  // array already ends with a user turn.
  const extractionPrompt = { role: 'user', content: 'Please extract the structured JSON data from the conversation above.' }
  const lastRole = messages[messages.length - 1]?.role
  const messagesForExtraction = lastRole === 'assistant'
    ? [...messages, extractionPrompt]
    : messages

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system: `You are a data extraction assistant. Read the fitness coaching onboarding conversation below and extract structured data. Return ONLY valid JSON with no other text, markdown, or code fences.

{
  "goals": [
    {
      "goal_statement": "Clear first-person goal statement, e.g. 'Run a 5k without stopping by end of summer'",
      "milestones_json": [
        "Milestone 1 — a logical stepping stone toward the goal",
        "Milestone 2",
        "Milestone 3"
      ]
    }
  ],
  "profile": {
    "goals_summary": "Brief 1–2 sentence summary of what the user wants to achieve",
    "experience_level": "novice | intermediate | advanced — pick the closest match, or null if unclear",
    "preferred_session_types": ["array using only values from: kettlebell, hiit_bodyweight, yoga, pilates, plyometrics, coordination, flexibility, gym_strength — include only types the user mentioned or implied a preference for"],
    "available_days": [1, 3, 5],
    "preferred_session_duration_mins": 45
  },
  "notifications": {
    "pre_session_notif_enabled": false,
    "pre_session_notif_timing": null,
    "post_session_notif_enabled": false,
    "post_session_notif_delay_mins": null,
    "weekly_review_notif_enabled": false,
    "weekly_review_day": null,
    "weekly_review_time": null,
    "master_notifications_enabled": true
  }
}

Rules:
- goals array must have at least one entry
- milestones_json should have 3–5 milestones that logically progress toward the goal
- experience_level must be exactly one of: "novice", "intermediate", "advanced", or null
- preferred_session_types items must be from the allowed list only (omit unrecognised types)
- available_days is an array of integers where 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat — use only days the user explicitly mentioned; use null if not discussed
- preferred_session_duration_mins is an integer (e.g. 30, 45, 60); use null if not discussed
- Notification fields default to false/null unless the user explicitly discussed notifications`,
      messages: messagesForExtraction,
    }),
  })

  if (!response.ok) throw new Error('Failed to extract onboarding data')

  const data = await response.json()

  try {
    const cleaned = data.reply.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleaned)
  } catch {
    // Fallback: minimal structure so the save doesn't hard-crash
    return {
      goals: [{ goal_statement: data.reply.trim(), milestones_json: null }],
      profile: { goals_summary: null },
      notifications: { master_notifications_enabled: true },
    }
  }
}

