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
 * Extracts all structured onboarding data from a completed onboarding conversation
 * in a single API call. Returns goals (with milestones), profile fields, and
 * notification preferences ready to be saved to Supabase.
 *
 * @param {Array<{role: string, content: string}>} messages - full conversation history
 * @returns {Promise<{goals: Array, profile: Object, notifications: Object}>}
 */
export async function extractOnboardingData(messages) {
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
      messages,
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
