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
export async function makeClaudeCall(systemPrompt, userMessage, maxTokens = 3000) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
      max_tokens: maxTokens,
      skipTools:  true,   // Phase 1/3 are pure JSON generation — no tool calls needed
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
  const { contextString: contextBlock } = await buildContext(userId, persona, messages)
  const today = new Date().toISOString().slice(0, 10)

  const system = `Today's date: ${today}\nConversation mode: ${mode}\n\n${contextBlock}\n\n${systemPrompt}`

  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages, userId, max_tokens: 4096 }),
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

  // ── 1. Fetch goals, profile, and exercise taxonomy in parallel ───────────
  const [goalsRes, profileRes, taxonomyRes] = await Promise.all([
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

    // Lightweight taxonomy fetch — just category + muscles, no descriptions
    supabase
      .from('exercises')
      .select('category, muscles_primary'),
  ])

  const goals          = goalsRes.data    || []
  const profile        = profileRes.data  || {}
  const taxonomyData   = taxonomyRes.data || []

  const userLevel      = profile.experience_level || 'novice'
  const preferredTypes = profile.preferred_session_types || []
  const today          = new Date().toISOString().slice(0, 10)
  const availableDayNames = (profile.available_days || []).map(d => DAY_NAMES[d]).join(', ')
  const sessionDuration   = profile.preferred_session_duration_mins || 45
  const sessionsPerWeek   = profile.available_days?.length || 3

  // Derive taxonomy from the exercise data
  const categories = [...new Set(taxonomyData.map(e => e.category).filter(Boolean))].sort()
  const muscles    = [...new Set(taxonomyData.flatMap(e => e.muscles_primary || []))].sort()

  const goalsText = goals.length
    ? goals.map((g, i) => `${i + 1}. id="${g.id}" — ${g.goal_statement}`).join('\n')
    : 'No goals set yet.'

  // ── PHASE 1: Rex reasons about session requirements ──────────────────────
  // Rex plans the week structure and specifies what to target per session.
  // No exercises in the prompt yet — keeps this call lightweight (~800 tokens out).
  const phase1Res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 800,
      system: `${REX_SYSTEM_PROMPT}

You are planning a weekly training programme. Decide the SESSION STRUCTURE only — which days, what training focus, and which muscles to target. Do NOT assign specific exercises yet.

VALID EXERCISE CATEGORIES (use exactly as written):
${categories.join(', ')}

VALID MUSCLE NAMES (use exactly as written):
${muscles.join(', ')}

Return ONLY a JSON array — no other text, markdown, or code fences.`,
      messages: [{
        role: 'user',
        content: `Plan ${sessionsPerWeek} sessions for the week starting ${today}.

USER LEVEL: ${userLevel}
AVAILABLE DAYS: ${availableDayNames || 'Mon, Wed, Fri'}
SESSION DURATION: ${sessionDuration} mins
PREFERRED TYPES: ${preferredTypes.join(', ') || 'any'}

GOALS:
${goalsText}

For each session return:
[{
  "date": "YYYY-MM-DD",
  "session_type": "e.g. kettlebell",
  "title": "5 words max",
  "purpose_note": "One sentence ending with a full stop.",
  "goal_id": "uuid from goals or null",
  "category": "exact category name from the valid list",
  "muscle_targets": ["muscle1", "muscle2", "muscle3"]
}]

Rules:
- Only schedule sessions on the user's available days within the next 7 days
- muscle_targets must be from the valid muscle names list exactly
- category must be from the valid categories list exactly`,
      }],
    }),
  })

  if (!phase1Res.ok) return []

  const phase1Data = await phase1Res.json()
  let sessionRequirements
  try {
    const cleaned = phase1Data.reply.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
    sessionRequirements = JSON.parse(cleaned)
    if (!Array.isArray(sessionRequirements) || sessionRequirements.length === 0) return []
  } catch {
    return []
  }

  // ── PHASE 2: Fetch targeted exercises for each session ───────────────────
  // Query the DB using Rex's requirements: category + overlapping muscles.
  // Falls back to category-only if the muscle overlap returns nothing.
  const sessionPools = await Promise.all(
    sessionRequirements.map(async req => {
      const muscleTargets = Array.isArray(req.muscle_targets) ? req.muscle_targets : []
      const validCategory = categories.includes(req.category)

      let query = supabase
        .from('exercises')
        .select('id, name, muscles_primary')
        .eq('experience_level', userLevel)
        .limit(20)

      if (validCategory) query = query.eq('category', req.category)
      if (muscleTargets.length > 0) query = query.overlaps('muscles_primary', muscleTargets)

      let { data: exercises } = await query

      // Fallback: category-only if muscle overlap returned nothing
      if ((!exercises || exercises.length === 0) && validCategory) {
        const fallback = await supabase
          .from('exercises')
          .select('id, name, muscles_primary')
          .eq('experience_level', userLevel)
          .eq('category', req.category)
          .limit(20)
        exercises = fallback.data || []
      }

      return { ...req, exercisePool: exercises || [] }
    })
  )

  // ── PHASE 3: Rex builds the full plan with specific exercise IDs ─────────
  // Rex receives only the exercises that match each session's requirements.
  const exerciseContext = sessionPools.map((s, i) => {
    const exList = s.exercisePool.length
      ? s.exercisePool.map(e =>
          `  id="${e.id}" | "${e.name}" | targets: ${(e.muscles_primary || []).join(', ')}`
        ).join('\n')
      : '  (no exercises matched)'
    return `Session ${i + 1} — ${s.date} | ${s.title}\nPurpose: ${s.purpose_note}\nAvailable exercises:\n${exList}`
  }).join('\n\n')

  const phase3Res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 3000,
      system: `${REX_SYSTEM_PROMPT}

You are building a detailed training plan. For each session, select 4–5 exercises from the available pool and assign sets, reps, rest, and a technique cue.
Return ONLY a valid JSON array — no other text, markdown, or code fences.`,
      messages: [{
        role: 'user',
        content: `Build the full plan. duration_mins is ${sessionDuration} for all sessions.

${exerciseContext}

Return:
[{
  "date": "YYYY-MM-DD",
  "session_type": "...",
  "title": "...",
  "duration_mins": ${sessionDuration},
  "purpose_note": "One sentence ending with a full stop.",
  "goal_id": "uuid or null",
  "exercises": [{
    "exercise_id": "uuid — must match exactly from available exercises above",
    "exercise_name": "matching name",
    "sets": 3,
    "reps": 12,
    "weight_kg": null,
    "rest_secs": 60,
    "technique_cue": "One short cue"
  }]
}]

Rules:
- exercise_id MUST be a UUID exactly as listed above — never invent IDs
- Include 4–5 exercises per session
- purpose_note must be exactly one sentence ending with a full stop
- goal_id must match a goal UUID from the session requirements, or null`,
      }],
    }),
  })

  if (!phase3Res.ok) return []

  const phase3Data = await phase3Res.json()
  try {
    const cleaned = phase3Data.reply.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
    const parsed  = JSON.parse(cleaned)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
