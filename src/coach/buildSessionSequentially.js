/**
 * Builds a single training session via Claude and saves it to sessions_planned.
 * Called once per session in the sequential programme build loop.
 */

const DAY_NUMBERS = {
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3,
  Thursday: 4, Friday: 5, Saturday: 6,
}

/**
 * Returns the ISO date string (YYYY-MM-DD) for the next occurrence of dayName.
 * If today is that day, uses next week's date — the first session is always
 * at least 1 day ahead, giving the user time to review the plan.
 */
function getNextOccurrence(dayName) {
  const target = DAY_NUMBERS[dayName]
  if (target == null) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  let daysUntil = target - today.getDay()
  if (daysUntil <= 0) daysUntil += 7
  const result = new Date(today)
  result.setDate(today.getDate() + daysUntil)
  return result.toISOString().slice(0, 10)
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

  const date = getNextOccurrence(day)
  if (!date) {
    return { success: false, error: `Could not calculate date for day: ${day}` }
  }

  const alreadyNote = alreadyBuiltSessions.length > 0
    ? `Sessions already built this week:\n${alreadyBuiltSessions.map(s => `- ${s.day}: ${s.title} (${s.session_type})`).join('\n')}`
    : 'This is the first session being built.'

  const exclusionsNote = constraints.exclusions?.length > 0
    ? `\nExclusions to respect: ${constraints.exclusions.join('; ')}`
    : ''

  const systemPrompt =
    'You are Rex, an expert personal trainer. Build exactly one training session. ' +
    'Return ONLY valid JSON — no markdown fences, no preamble, no trailing text.'

  const userMessage =
    `Build session ${sessionIndex + 1} of ${constraints.session_days.length}.\n\n` +
    `AGREED PROGRAMME CONSTRAINTS:\n` +
    `Goal: ${constraints.goal_summary || 'General fitness'}\n` +
    `Equipment: ${constraints.equipment?.join(', ') || 'bodyweight / not specified'}\n` +
    `Duration per session: ${constraints.duration_mins || 45} mins` +
    `${exclusionsNote}\n\n` +
    `THIS SESSION:\n` +
    `Day: ${day}\n` +
    `Session type: ${sessionType}\n` +
    `Date: ${date}\n\n` +
    `${alreadyNote}\n\n` +
    `Return ONLY this JSON:\n` +
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

    const { error: dbError } = await supabaseClient.from('sessions_planned').insert({
      user_id:        userId,
      date,
      session_type:   session.session_type   || sessionType,
      title:          session.title          || `${day} ${sessionType}`,
      duration_mins:  session.duration_mins  ?? constraints.duration_mins ?? 45,
      purpose_note:   session.purpose_note   || null,
      exercises_json: session.exercises_json || [],
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
