import { buildContext } from './buildContext'
import { FITZ_SYSTEM_PROMPT } from './systemPrompt'
import { REX_SYSTEM_PROMPT } from './trainerPrompt'
import { supabase } from '../lib/supabase'

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
  const contextBlock = await buildContext(userId, persona)

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
  return callChatApi(FITZ_SYSTEM_PROMPT, userId, messages, mode, 'fitz')
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
  return callChatApi(REX_SYSTEM_PROMPT, userId, messages, mode, 'rex')
}

/**
 * Sends a message to Fitz in wellbeing check-in mode.
 * A brief biopsychosocial check-in covering physical, social, and emotional domains.
 */
export async function askFitzWellbeing(userId, messages) {
  return callChatApi(FITZ_SYSTEM_PROMPT, userId, messages, 'wellbeing_checkin', 'fitz')
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

/**
 * Asks Rex to generate an initial weekly training plan for a new user.
 * Fetches goals, profile, and the exercise library from Supabase, sends
 * everything to Rex, and returns a structured array of sessions ready to
 * be inserted into sessions_planned.
 *
 * Each session object has the shape:
 *   { date, session_type, title, duration_mins, purpose_note, goal_id, exercises[] }
 * where exercises[] matches the sessions_planned.exercises_json schema.
 *
 * @param {string} userId - The authenticated user's UUID
 * @returns {Promise<Array>} Array of session objects (may be empty on failure)
 */
export async function generateWeeklyPlan(userId) {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // 1. Fetch goals, profile, and exercises in parallel
  const [goalsRes, profileRes, exercisesRes] = await Promise.all([
    supabase
      .from('goals')
      .select('id, goal_statement')
      .eq('user_id', userId)
      .eq('status', 'active'),

    supabase
      .from('user_profiles')
      .select('experience_level, preferred_session_types, available_days, preferred_session_duration_mins')
      .eq('user_id', userId)
      .single(),

    supabase
      .from('exercises')
      .select('id, name, category, experience_level, muscles_primary'),
  ])

  const goals       = goalsRes.data    || []
  const profile     = profileRes.data  || {}
  const allExercises = exercisesRes.data || []

  // 2. Filter exercises to what's relevant for this user
  const preferredTypes = profile.preferred_session_types || []
  const userLevel      = profile.experience_level || 'novice'

  // Cap at 20 per category — gives Rex full range across all types (~180 exercises total)
  // while preventing Strength & Hypertrophy (400+ entries) from flooding the prompt
  const byCategory = {}
  for (const e of allExercises) {
    if (e.experience_level !== 'all' && e.experience_level !== userLevel) continue
    if (!byCategory[e.category]) byCategory[e.category] = []
    if (byCategory[e.category].length < 20) byCategory[e.category].push(e)
  }
  const exercises = Object.values(byCategory).flat()

  // 3. Format data for the prompt
  const today            = new Date().toISOString().slice(0, 10)
  const availableDayNames = (profile.available_days || []).map(d => DAY_NAMES[d]).join(', ')
  const sessionDuration  = profile.preferred_session_duration_mins || 45

  const goalsText = goals.length
    ? goals.map((g, i) => `${i + 1}. id="${g.id}" — ${g.goal_statement}`).join('\n')
    : 'No goals set yet.'

  const exerciseLibrary = exercises.length
    ? exercises.map(e =>
        `id="${e.id}" | "${e.name}" | ${e.category} | level:${e.experience_level} | muscles:${(e.muscles_primary || []).slice(0, 3).join(', ')}`
      ).join('\n')
    : 'No exercises found in library.'

  // 4. Call Rex to generate the plan
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 3000,
      system: `${REX_SYSTEM_PROMPT}

You are generating an initial weekly training plan for a brand-new user. Return ONLY a JSON array — no other text, markdown, or code fences.

TODAY: ${today}
USER LEVEL: ${userLevel}
AVAILABLE DAYS: ${availableDayNames || 'Mon, Wed, Fri (default)'}
SESSION DURATION: ${sessionDuration} mins
PREFERRED TYPES: ${preferredTypes.join(', ') || 'any'}

GOALS (link sessions to these IDs):
${goalsText}

EXERCISE LIBRARY — only use IDs from this list:
${exerciseLibrary}

Return a JSON array of sessions scheduled on the user's available days within the next 7 days:
[
  {
    "date": "YYYY-MM-DD",
    "session_type": "category name matching library (e.g. kettlebell)",
    "title": "Session title, 5 words max",
    "duration_mins": ${sessionDuration},
    "purpose_note": "One sentence: what this session trains and how it directly advances the user's goal.",
    "goal_id": "uuid from GOALS above, or null",
    "exercises": [
      {
        "exercise_id": "uuid from EXERCISE LIBRARY — must match exactly",
        "exercise_name": "Name matching the library entry",
        "sets": 3,
        "reps": 12,
        "weight_kg": null,
        "rest_secs": 60,
        "technique_cue": "One short technique cue for this exercise"
      }
    ]
  }
]

Rules:
- Only schedule sessions on the user's available days within the next 7 days
- Include 4–5 exercises per session
- exercise_id MUST be a UUID exactly as listed in the EXERCISE LIBRARY — never invent IDs
- If the exercise library is empty, return an empty array []
- purpose_note must be exactly one sentence ending with a full stop
- goal_id must be a valid UUID from GOALS, or null if no goals exist`,
      messages: [{ role: 'user', content: 'Generate my initial weekly training plan.' }],
    }),
  })

  if (!response.ok) throw new Error(`Plan generation API error ${response.status}`)

  const data = await response.json()

  try {
    const cleaned = data.reply.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
    const parsed  = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
