/**
 * Rex plan generation orchestrator.
 *
 * Coordinates the 3-phase pipeline:
 *
 *   Phase 1 — Rex reasons about the week (taxonomy + user context only).
 *              Returns a JSON object with session requirements: which days,
 *              which muscles, what intensity. No exercises yet.
 *
 *   Phase 2 — App queries the DB using Rex's requirements. Supabase returns
 *              only exercises that match each session's category and muscles.
 *
 *   Phase 3 — Two sub-phases to avoid token truncation:
 *     3a. generateProgrammeShell — generates the programme header only (~400 tokens)
 *     3b. generateSingleSession  — generates one session at a time (~1200 tokens each)
 *
 * After Phase 3 the orchestrator:
 *   - Calls createProgramme to persist the programme row (archives any existing active one)
 *   - Calls saveProgrammeSessions to batch-insert all session rows
 *
 * The callClaude and supabase dependencies are injected so this module can
 * be tested in isolation without live API or DB connections.
 */

import { buildContext }                        from './buildContext'
import { buildRexPlanContext, queryExercises } from './rexPlanning'
import { buildPhase1Prompt }                   from './trainerPrompt'
import { createProgramme, saveProgrammeSessions } from './programmeService'
import { makeClaudeCall }                      from './claudeApi'

/**
 * Robustly extracts the first complete JSON object or array from a raw string.
 * Strips markdown code fences first, then finds the opening { or [ and
 * brace-counts to locate the matching close, ignoring any trailing prose.
 * Properly handles { and } characters inside quoted string values.
 *
 * @param {string} raw - Raw text from Claude that should contain JSON
 * @returns {string} - The extracted JSON substring
 */
function extractJson(raw) {
  const stripped    = raw.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
  const firstBrace  = stripped.indexOf('{')
  const firstBracket = stripped.indexOf('[')
  // Use whichever delimiter appears first — arrays ([) beat objects ({) if they come first
  const openChar = (firstBracket !== -1 && (firstBracket < firstBrace || firstBrace === -1)) ? '[' : '{'
  const closeChar = openChar === '[' ? ']' : '}'
  const start = stripped.indexOf(openChar)
  if (start === -1) return stripped          // nothing to extract — let JSON.parse report the error

  let depth    = 0
  let inString = false
  let escaped  = false

  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]

    // Track escape sequences so \" inside a string doesn't flip inString
    if (escaped)  { escaped = false; continue }
    if (ch === '\\' && inString) { escaped = true; continue }

    // Toggle string mode on unescaped double-quotes
    if (ch === '"') { inString = !inString; continue }

    // Skip all characters while inside a string value
    if (inString) continue

    if (ch === openChar)  depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) return stripped.slice(start, i + 1)
    }
  }
  return stripped.slice(start)              // unclosed — return from opening char anyway
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Returns only valid UUID strings from an array, discarding any placeholder
 * strings Claude may generate (e.g. "goal_id_fat_loss").
 */
function sanitizeUuidArray(arr) {
  if (!Array.isArray(arr)) return []
  return arr.filter(id => typeof id === 'string' && UUID_REGEX.test(id))
}

/**
 * Generates just the programme header (no sessions).
 * ~400 tokens output — well within a single API call budget.
 *
 * @param {Function} callClaude
 * @param {string}   userContext  - Formatted context string from buildContext
 * @param {Array}    sessionPools - Session pool array (used for session count)
 * @returns {Promise<object>} Programme shell object
 */
async function generateProgrammeShell(callClaude, userContext, sessionPools) {
  const system = `You are Rex, an expert personal trainer. Based on the user context and session requirements below, return ONLY a JSON object (no markdown, no preamble) with this exact shape:

{
  "title": "string — short descriptive programme name",
  "description": "string — 1-2 sentences describing the overall programme intent",
  "total_weeks": 4,
  "goal_ids": [],
  "phase_structure_json": [
    {
      "phase": 1,
      "weeks": "1-2",
      "label": "Foundation",
      "focus": "string",
      "overload_strategy": "string"
    },
    {
      "phase": 2,
      "weeks": "3-4",
      "label": "Build",
      "focus": "string",
      "overload_strategy": "string"
    }
  ],
  "progression_summary": "string — one or two sentences on how load and intensity progress",
  "created_by": "rex_initial"
}

Rules:
- goal_ids must be a JSON array of valid UUIDs from user context goals, or []
- created_by must be exactly "rex_initial"
- Output ONLY the JSON object — no markdown, no code fences, no prose

USER CONTEXT:
${userContext}

SESSION COUNT: ${sessionPools.length} sessions per week`

  const raw = await callClaude(system, 'Generate the programme header JSON.', 600)
  const parsed = JSON.parse(extractJson(raw))

  // Strip any non-UUID values Claude may have invented for goal_ids
  parsed.goal_ids = sanitizeUuidArray(parsed.goal_ids)

  console.log(`[generateProgrammeShell] Generated: "${parsed.title}"`)
  return parsed
}

/**
 * Generates one complete training session.
 * ~1200 tokens output per call — safely within a single API call budget.
 * Also enriches exercises_json with name + technique content from the DB pool.
 *
 * @param {Function} callClaude
 * @param {string}   userContext   - Formatted context string from buildContext
 * @param {object}   sessionPool   - Single session pool (from Phase 2)
 * @param {object}   programme     - Programme shell from generateProgrammeShell
 * @param {number}   sessionIndex  - 1-based index of this session
 * @param {number}   totalSessions - Total number of sessions in the week
 * @returns {Promise<object>} Complete session object ready for DB insertion
 */
async function generateSingleSession(callClaude, userContext, sessionPool, programme, sessionIndex, totalSessions) {
  const exList = (sessionPool.exercises || []).map(e =>
    `  id="${e.id}" | "${e.name}" | primary: ${(e.muscles_primary || []).join(', ')}`
  ).join('\n')

  const system = `You are Rex, an expert personal trainer. Generate ONE complete training session using ONLY the exercises provided in the pool below. Return ONLY a JSON object (no markdown, no preamble) with this exact shape:

{
  "week_number": 1,
  "session_number": ${sessionIndex},
  "day_of_week": "${sessionPool.day}",
  "session_type": "${sessionPool.session_type}",
  "title": "5 words max",
  "purpose_note": "One sentence ending with a full stop.",
  "goal_ids": [],
  "duration_mins": ${sessionPool.duration_mins || 60},
  "warm_up_json": [
    {"exercise_id": null, "name": "string", "sets": 1, "reps": null, "duration_secs": 30}
  ],
  "exercises_json": [
    {"exercise_id": "uuid — must match exactly from the pool below", "sets": 3, "reps": 12, "weight_kg": null, "rest_secs": 60}
  ],
  "cool_down_json": [
    {"exercise_id": null, "name": "string", "duration_secs": 30, "sets": 1, "reps": null}
  ]
}

Requirements:
- warm_up_json: 3-4 exercises (joint mobility, activation), 5-8 minutes total. exercise_id must be null.
- exercises_json: 5-6 exercises for a 40-45 minute main block. exercise_id MUST be a UUID exactly as listed in the pool — never invent IDs.
- cool_down_json: 3-4 exercises (static stretches, breathing), 5-8 minutes total. exercise_id must be null.
- goal_ids must be a JSON array of valid UUIDs from user context goals, or []
- Output ONLY the JSON object — no markdown, no code fences, no prose

PROGRAMME CONTEXT:
${programme.title} — ${programme.progression_summary}

EXERCISE POOL (session ${sessionIndex}/${totalSessions} — use ONLY these IDs for exercises_json):
${exList || '  (none matched — use bodyweight exercises with exercise_id: null)'}

USER CONTEXT:
${userContext}`

  const raw = await callClaude(
    system,
    `Generate session ${sessionIndex} of ${totalSessions}: ${sessionPool.session_type} on ${sessionPool.day}.`,
    1500
  )

  let parsed
  try {
    // Fix occasional Claude typos before parsing:
    //   ":_N"  → ": N"  (e.g. "sets":_1 instead of "sets": 1)
    const jsonStr = extractJson(raw).replace(/:_(\d)/g, ': $1')
    parsed = JSON.parse(jsonStr)
  } catch (parseErr) {
    console.error(`[generateSingleSession] Session ${sessionIndex} JSON parse failed. Raw:`, raw)
    throw new Error(`Session ${sessionIndex} JSON parsing failed: ${parseErr.message}`)
  }

  // Strip any non-UUID values Claude may have invented for goal_ids
  parsed.goal_ids = sanitizeUuidArray(parsed.goal_ids)

  // ── Enrich exercises_json from DB pool ────────────────────────────────────
  // Claude outputs exercise_id + prescription. Name, technique cue, and muscle
  // data are injected from the Phase 2 pool — no extra DB round-trip needed.
  const exerciseMap = {}
  for (const ex of sessionPool.exercises || []) {
    exerciseMap[ex.id] = ex
  }

  parsed.exercises_json = (parsed.exercises_json || []).map(ex => {
    const dbEx = ex.exercise_id ? exerciseMap[ex.exercise_id] : null
    if (!dbEx) return ex
    const cueParts = [dbEx.description_start, dbEx.description_move].filter(Boolean)
    return {
      ...ex,
      name:            dbEx.name,
      technique_cue:   cueParts.join(' ') || null,
      avoid_cue:       dbEx.description_avoid || null,
      muscles_primary: dbEx.muscles_primary ?? [],
      gif_url:         dbEx.gif_url || null,
    }
  })

  console.log(
    `[generateSingleSession] Session ${sessionIndex}/${totalSessions} done — ` +
    `${(parsed.exercises_json || []).length} main exercises`
  )

  return parsed
}

/**
 * Generates a weekly training plan using Rex's 3-phase reasoning pipeline,
 * then saves the result to the `programmes` and `programme_sessions` tables.
 *
 * @param {string}  userId    - Authenticated user's UUID
 * @param {object}  supabase  - Supabase client instance
 * @param {(systemPrompt: string, userMessage: string, maxTokens?: number) => Promise<string>} callClaude
 *   Accepts a system prompt string and a user message string.
 *   Returns the assistant's text response.
 *
 * @returns {Promise<{ programme: object, sessions: Array }>}
 *   The newly created programme row and all saved session rows.
 *
 * @throws If Phase 1 JSON parsing fails (logged + rethrown with descriptive message).
 * @throws If taxonomy or user context fetches fail.
 * @throws If any individual session generation fails.
 */
export async function generateRexPlan(userId, supabase, callClaude) {
  try {

    // ── Fetch user context and exercise taxonomy in parallel ────────────────
    const [contextResult, taxonomyString] = await Promise.all([
      buildContext(userId, 'rex'),
      buildRexPlanContext(userId, supabase),
    ])

    const userContext = contextResult.contextString

    // ── PHASE 1: Rex reasons about session requirements ─────────────────────
    // Rex sees only the taxonomy and user context — no exercises yet.
    // Outputs a JSON object: { sessions: [{ day, session_type, muscles, ... }] }

    const phase1System  = buildPhase1Prompt(userContext, taxonomyString)
    const phase1Message = 'Generate a weekly plan based on my profile.'
    const phase1Raw     = await callClaude(phase1System, phase1Message)

    let sessionRequirements
    try {
      const parsed  = JSON.parse(extractJson(phase1Raw))
      sessionRequirements = parsed.sessions
      if (!Array.isArray(sessionRequirements) || sessionRequirements.length === 0) {
        throw new Error('sessions array is empty or missing')
      }
    } catch (parseErr) {
      console.error('[generateRexPlan] Phase 1 JSON parse failed. Raw response:', phase1Raw)
      throw new Error(`Phase 1 JSON parsing failed: ${parseErr.message}`)
    }

    console.log(`[generateRexPlan] Phase 1 complete — ${sessionRequirements.length} sessions planned`)

    // ── PHASE 2: Fetch targeted exercises per session ───────────────────────
    // queryExercises tries precise (category + level + muscles) then falls back
    // to category + level only. Logs which path was used to Vercel function logs.

    const sessionPools = await Promise.all(
      sessionRequirements.map(async session => {
        const exercises = await queryExercises(
          {
            category:         session.session_type,
            experience_level: session.experience_level,
            muscles:          session.muscles || [],
          },
          supabase
        )
        return { ...session, exercises }
      })
    )

    console.log(`[generateRexPlan] Phase 2 complete — exercise pools fetched for ${sessionPools.length} sessions`)

    // ── PHASE 3: Programme shell + one session at a time ────────────────────
    // Generates the programme header first (~400 tokens), then each session
    // individually (~1200 tokens each) to avoid token truncation on long plans.

    const programmeShell = await generateProgrammeShell(callClaude, userContext, sessionPools)

    const sessions = []
    for (let i = 0; i < sessionPools.length; i++) {
      const sessionPool = sessionPools[i]
      console.log(
        `[generateRexPlan] Generating session ${i + 1}/${sessionPools.length}: ` +
        `${sessionPool.session_type} on ${sessionPool.day}`
      )
      const sessionDetail = await generateSingleSession(
        callClaude, userContext, sessionPool, programmeShell, i + 1, sessionPools.length
      )
      sessions.push(sessionDetail)
    }

    const plan = { programme: programmeShell, sessions }

    // ── Save to DB ──────────────────────────────────────────────────────────
    // 1. Create programme row (archives any existing active programme for this user)
    const { data: programmeRow, error: progError } = await createProgramme(userId, plan.programme)
    if (progError || !programmeRow) {
      throw new Error(`Failed to save programme: ${progError?.message || 'no row returned'}`)
    }

    // 2. Batch-insert all session rows
    const { data: sessionRows, error: sessError } = await saveProgrammeSessions(
      programmeRow.id,
      userId,
      plan.sessions
    )
    if (sessError) {
      throw new Error(`Failed to save programme sessions: ${sessError.message}`)
    }

    console.log(
      `[generateRexPlan] Saved programme "${programmeRow.title}" ` +
      `(${programmeRow.id}) with ${(sessionRows || []).length} sessions for user ${userId}`
    )

    return { programme: programmeRow, sessions: sessionRows || [] }

  } catch (err) {
    console.error('[generateRexPlan] Plan generation failed:', err.message)
    throw err
  }
}

/**
 * Generates a new week of programme sessions using Week 1 as a template,
 * applying the appropriate phase progression rules.
 *
 * Called when the user taps "Set up Week N" in the Programme screen.
 * Rex receives the Week 1 exercise prescriptions plus the phase's
 * overload_strategy and generates adjusted sets/reps/weight for Week N.
 * Exercise IDs are preserved so the week 1 enrichment (names, cues) carries over.
 *
 * @param {object}   programme      - Active programme row (includes phase_structure_json, progression_summary)
 * @param {Array}    week1Sessions  - All programme_sessions rows for week_number = 1
 * @param {number}   targetWeek     - The week number to generate (2, 3, 4 …)
 * @param {string}   userId         - Authenticated user's UUID
 * @param {object}   supabaseClient - Supabase client instance
 * @returns {Promise<{ data: Array|null, error: object|null }>}
 */
export async function generateNextWeek(programme, week1Sessions, targetWeek, userId, supabaseClient) {
  // ── Resolve which phase targetWeek belongs to ──────────────────────────────
  const phases = programme.phase_structure_json ?? []
  const phase = phases.find(p => {
    const parts  = String(p.weeks).split('-').map(Number)
    const [s, e] = [parts[0], parts[1] ?? parts[0]]
    return targetWeek >= s && targetWeek <= e
  }) ?? { label: 'Build', focus: 'Progressive overload', overload_strategy: 'Increase load or reps from the previous week' }

  // ── Build a compact exercise prescription listing from Week 1 ──────────────
  const sessionLines = week1Sessions.map((s, i) => {
    const exLines = (s.exercises_json ?? []).map(ex =>
      `    exercise_id="${ex.exercise_id ?? 'null'}" name="${ex.name ?? ''}" sets=${ex.sets ?? 3} reps=${ex.reps ?? 10} weight_kg=${ex.weight_kg ?? 'null'} rest_secs=${ex.rest_secs ?? 60}`
    ).join('\n')
    return `Session ${i + 1}: "${s.title}" | ${s.session_type} | ${s.day_of_week} | ${s.duration_mins} mins\nPurpose: ${s.purpose_note}\nExercises (Week 1 baseline):\n${exLines}`
  }).join('\n\n')

  const system = `You are Rex, an expert personal trainer. You are generating Week ${targetWeek} of "${programme.title}" (${programme.total_weeks}-week programme).

PROGRAMME PROGRESSION:
${programme.progression_summary}

PHASE FOR WEEK ${targetWeek}: ${phase.label}
Focus: ${phase.focus}
Overload strategy: ${phase.overload_strategy}

WEEK 1 SESSIONS (your baseline — same structure, progress the prescription):
${sessionLines}

Return ONLY a JSON array (no markdown, no prose) with ${week1Sessions.length} session objects:
[
  {
    "session_number": 1,
    "title": "5 words max",
    "purpose_note": "One sentence ending with a full stop.",
    "warm_up_json": [{"exercise_id": null, "name": "string", "sets": 1, "reps": null, "duration_secs": 30}],
    "exercises_json": [{"exercise_id": "EXACT UUID from Week 1 — never change", "sets": 3, "reps": 12, "weight_kg": null, "rest_secs": 60}],
    "cool_down_json": [{"exercise_id": null, "name": "string", "sets": 1, "reps": null, "duration_secs": 30}]
  }
]

Rules:
- exercise_id values in exercises_json MUST be copied exactly from Week 1 — never invent or change them
- Apply the overload strategy: adjust sets, reps, or weight_kg compared to Week 1
- warm_up_json and cool_down_json exercise_id must always be null
- Output ONLY the JSON array`

  const raw = await makeClaudeCall(
    system,
    `Generate Week ${targetWeek} sessions (${week1Sessions.length} sessions) applying: ${phase.overload_strategy}`,
    4096,
  )

  let parsedSessions
  try {
    const jsonStr = extractJson(raw).replace(/:_(\d)/g, ': $1')
    parsedSessions = JSON.parse(jsonStr)
    if (!Array.isArray(parsedSessions)) throw new Error('Response is not an array')
  } catch (parseErr) {
    console.error('[generateNextWeek] JSON parse failed. Raw:', raw)
    throw new Error(`Week ${targetWeek} JSON parsing failed: ${parseErr.message}`)
  }

  // ── Enrich exercises_json using Week 1 data (name, technique_cue, etc.) ────
  // Build a map from exercise_id → Week 1 enrichment fields
  const enrichmentMap = {}
  for (const s of week1Sessions) {
    for (const ex of s.exercises_json ?? []) {
      if (ex.exercise_id) enrichmentMap[ex.exercise_id] = ex
    }
  }

  // ── Build DB rows, merging Week 1 template structure with Rex's prescription
  const newRows = week1Sessions.map((template, i) => {
    const generated = parsedSessions[i] ?? {}

    const enrichedExercises = (generated.exercises_json ?? template.exercises_json ?? []).map(ex => {
      const base = ex.exercise_id ? enrichmentMap[ex.exercise_id] : null
      return {
        ...ex,
        name:            base?.name            ?? ex.name            ?? null,
        technique_cue:   base?.technique_cue   ?? ex.technique_cue   ?? null,
        avoid_cue:       base?.avoid_cue       ?? ex.avoid_cue       ?? null,
        muscles_primary: base?.muscles_primary ?? ex.muscles_primary ?? [],
        gif_url:         base?.gif_url         ?? ex.gif_url         ?? null,
      }
    })

    return {
      programme_id:        programme.id,
      user_id:             userId,
      week_number:         targetWeek,
      session_number:      template.session_number,
      day_of_week:         template.day_of_week,
      session_type:        template.session_type,
      title:               generated.title        ?? template.title,
      purpose_note:        generated.purpose_note ?? template.purpose_note,
      goal_ids:            template.goal_ids       ?? [],
      duration_mins:       template.duration_mins,
      warm_up_json:        generated.warm_up_json  ?? template.warm_up_json  ?? [],
      exercises_json:      enrichedExercises,
      cool_down_json:      generated.cool_down_json ?? template.cool_down_json ?? [],
      coach_note:          null,
      progression_note:    `Week ${targetWeek} — ${phase.overload_strategy}`,
      status:              'planned',
      sessions_planned_id: null,
      scheduled_date:      null,
    }
  })

  const { data, error } = await supabaseClient
    .from('programme_sessions')
    .insert(newRows)
    .select()

  if (error) {
    console.error(`[generateNextWeek] DB insert failed:`, error.message)
  } else {
    console.log(`[generateNextWeek] Saved ${(data ?? []).length} sessions for Week ${targetWeek}`)
  }

  return { data: data ?? null, error: error ?? null }
}
