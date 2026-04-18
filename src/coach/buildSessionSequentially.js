/**
 * Builds a single training session via Claude and saves it to sessions_planned.
 * Called once per session in the sequential programme build loop.
 */

import { validateSequentialSession } from './sessionValidator'

/**
 * Returns the ISO date string (YYYY-MM-DD) for the next occurrence of dayName.
 * If today is that day, uses next week's date — the first session is always
 * at least 1 day ahead, giving the user time to review the plan.
 * Uses local date arithmetic to avoid UTC timezone offset issues.
 */
function getNextDateForDay(dayName) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const today = new Date()
  const todayIndex = today.getDay()
  const targetIndex = days.indexOf(dayName)
  if (targetIndex === -1) return null
  let daysUntilTarget = targetIndex - todayIndex
  if (daysUntilTarget <= 0) daysUntilTarget += 7
  const targetDate = new Date(today)
  targetDate.setDate(today.getDate() + daysUntilTarget)
  // Use local date parts to avoid UTC offset shifting the day
  const y = targetDate.getFullYear()
  const m = String(targetDate.getMonth() + 1).padStart(2, '0')
  const d = String(targetDate.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Builds one session via Claude Haiku and writes it to sessions_planned.
 *
 * @param {string} userId
 * @param {object} constraints - programme constraints extracted from conversation
 * @param {number} sessionIndex - 0-indexed position in this week's sessions
 * @param {Array<{day, session_type, title}>} alreadyBuiltSessions
 * @param {object} supabaseClient - Supabase client instance
 * @returns {Promise<{success: boolean, session?: object, error?: string}>}
 */
export async function buildSessionSequentially(
  userId, constraints, sessionIndex, alreadyBuiltSessions, supabaseClient
) {
  const day         = constraints.session_days?.[sessionIndex]
  const sessionType = constraints.session_types?.[sessionIndex]

  if (!day || !sessionType) {
    return { success: false, error: `Missing day or session_type at index ${sessionIndex}` }
  }

  const date = getNextDateForDay(day)
  if (!date) {
    return { success: false, error: `Could not calculate date for day: ${day}` }
  }
  console.log('[Rex] session date calculated:', day, '->', date)

  const fullWeekPlan = constraints.session_days
    .map((d, i) => `  ${i + 1}. ${d}: ${constraints.session_types?.[i] || 'unspecified'}`)
    .join('\n')

  const alreadyNote = alreadyBuiltSessions.length > 0
    ? `Sessions already built:\n${alreadyBuiltSessions.map(s => `- ${s.day}: ${s.title} (${s.session_type})`).join('\n')}`
    : 'No sessions built yet — this is the first.'

  const exclusionsNote = constraints.exclusions?.length > 0
    ? `Exclusions: ${constraints.exclusions.join('; ')}`
    : 'No exclusions.'

  const systemPrompt =
    'You are Rex, an expert personal trainer. Your only job right now is to build one training session and return it as a JSON object. ' +
    'Return only the JSON object. Do not include any explanation, markdown, or preamble.'

  const userMessage =
    `BUILD SESSION ${sessionIndex + 1} OF ${constraints.session_days.length}\n\n` +
    `FULL WEEK PLAN (all sessions agreed with user):\n${fullWeekPlan}\n\n` +
    `YOU ARE BUILDING: Session ${sessionIndex + 1} — ${day} (${sessionType}) on ${date}\n\n` +
    `PROGRAMME CONSTRAINTS:\n` +
    `Goal: ${constraints.goal_summary || 'General fitness'}\n` +
    `Equipment: ${constraints.equipment?.join(', ') || 'bodyweight only'}\n` +
    `Duration: ${constraints.duration_mins || 45} mins\n` +
    `${exclusionsNote}\n\n` +
    `${alreadyNote}\n\n` +
    `Return only this JSON object — no other text:\n` +
    `{\n` +
    `  "title": "short descriptive title (4-6 words)",\n` +
    `  "session_type": "${sessionType}",\n` +
    `  "date": "${date}",\n` +
    `  "duration_mins": ${constraints.duration_mins || 45},\n` +
    `  "purpose_note": "one sentence — what this session builds or achieves",\n` +
    `  "exercises_json": [\n` +
    `    {\n` +
    `      "exercise_name": "Exercise Name",\n` +
    `      "sets": 3,\n` +
    `      "reps": "8-10",\n` +
    `      "weight_kg": null,\n` +
    `      "rest_secs": 90,\n` +
    `      "technique_cue": "2-3 sentence technique note"\n` +
    `    }\n` +
    `  ]\n` +
    `}`

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userMessage }],
        max_tokens: 1500,
        skipTools:  true,
        persona:    'rex',
      }),
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText)
      return { success: false, error: `API error ${response.status}: ${errText}` }
    }

    const data = await response.json()

    let session
    try {
      const cleaned = (data.reply || '').replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
      session = JSON.parse(cleaned)
    } catch (parseErr) {
      console.error(
        `[buildSessionSequentially] JSON parse failed for session ${sessionIndex + 1}:`,
        parseErr,
        '\nRaw reply:', data.reply
      )
      return { success: false, error: `JSON parse failed: ${parseErr.message}` }
    }

    const { session: repairedSession, repairs: seqRepairs } =
      validateSequentialSession(session)

    if (seqRepairs.length > 0) {
      console.log(
        `[validator] Sequential session ${sessionIndex + 1} — ${seqRepairs.length} repair(s):`,
        seqRepairs.join(' | ')
      )
    }

    const { error: dbError } = await supabaseClient.from('sessions_planned').insert({
      user_id:        userId,
      date,
      session_type:   repairedSession.session_type   || sessionType,
      title:          repairedSession.title          || `${day} ${sessionType}`,
      duration_mins:  repairedSession.duration_mins  ?? constraints.duration_mins ?? 45,
      purpose_note:   repairedSession.purpose_note   || null,
      exercises_json: repairedSession.exercises_json || [],
      status:         'planned',
    })

    if (dbError) {
      console.error(
        `[buildSessionSequentially] DB insert failed for session ${sessionIndex + 1}:`,
        dbError
      )
      return { success: false, error: dbError.message }
    }

    console.log(
      `[buildSessionSequentially] Session ${sessionIndex + 1} saved:`,
      `"${session.title}" → ${date}`
    )
    return {
      success: true,
      session: {
        day,
        session_type: session.session_type || sessionType,
        title:        session.title,
        duration_mins: session.duration_mins ?? constraints.duration_mins ?? 45,
      },
    }
  } catch (err) {
    console.error(
      `[buildSessionSequentially] Unexpected error for session ${sessionIndex + 1}:`,
      err
    )
    return { success: false, error: err.message }
  }
}
