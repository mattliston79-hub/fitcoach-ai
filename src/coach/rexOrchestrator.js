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
import { queryExercises } from './rexPlanning'
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
 * ARCHITECT PHASE (Levels 1-5):
 * Runs clinical reasoning and outputs a Blueprint JSON.
 * Does NOT select exercises. ~800-1200 input tokens, ~600 output tokens.
 * Target wall time: 8-15 seconds on Haiku.
 */
async function runArchitect(callClaude, userContext) {
  const { buildArchitectPrompt } = await import('./trainerPrompt')
  const system = buildArchitectPrompt(userContext)
  const raw = await callClaude(system, 'Analyse my profile and produce the training Blueprint.', 4096, { mode: 'programme_architect' })

  // Strip the <clinical_reasoning> block before parsing JSON.
  // Use indexOf so the strip works even if the tag spans unusual whitespace.
  const CLOSE_TAG = '</clinical_reasoning>'
  const closeIdx = raw.indexOf(CLOSE_TAG)
  const withoutThinking = closeIdx !== -1
    ? raw.slice(closeIdx + CLOSE_TAG.length).trim()
    : raw.trim()

  let blueprint
  try {
    blueprint = JSON.parse(extractJson(withoutThinking))
  } catch (err) {
    console.error('[runArchitect] JSON parse failed. Raw:', raw)
    throw new Error(`Architect JSON parsing failed: ${err.message}`)
  }

  // Validate minimum required fields
  if (!Array.isArray(blueprint.sessions) || blueprint.sessions.length === 0) {
    throw new Error('Blueprint missing sessions array')
  }
  if (!blueprint.programme_aim) {
    console.warn('[runArchitect] Blueprint missing programme_aim — proceeding with null')
  }

  console.log(`[runArchitect] Blueprint complete — ${blueprint.sessions.length} sessions planned, max_tier=${blueprint.capability_gap_profile?.max_tier ?? 'unknown'}`)
  return blueprint
}

/**
 * BUILDER PHASE (Level 6):
 * Receives Blueprint + exercise pools, assigns exercise IDs.
 * ~2500 input tokens, ~1500 output tokens.
 * Target wall time: 10-20 seconds on Sonnet.
 */
async function runBuilder(callClaude, blueprint, sessionPools) {
  const { buildBuilderPrompt } = await import('./trainerPrompt')

  // Build compact pool text — id and name only, no verbose fields
  const sessionPoolsText = sessionPools.map((pool, i) => {
    const session = blueprint.sessions[i] ?? {}
    const exList = (pool.exercises || [])
      .map(e => `  id="${e.id}" | "${e.name}"`)
      .join('\n')
    return (
      `Session ${i + 1} — ${session.day ?? pool.day} | ` +
      `domain: ${session.domain} | max_tier: ${session.max_tier ?? 2} | ` +
      `${session.duration_mins ?? 45} mins\n` +
      `Available exercises:\n${exList || '  (none matched)'}`
    )
  }).join('\n\n')

  const system = buildBuilderPrompt(blueprint, sessionPoolsText)
  const raw = await callClaude(system, 'Assign exercises from the pools to build the programme.', 4096, { mode: 'programme_builder' })

  let plan
  try {
    const jsonStr = extractJson(raw).replace(/:_(\d)/g, ': $1')
    plan = JSON.parse(jsonStr)
  } catch (err) {
    console.error('[runBuilder] JSON parse failed. Raw:', raw)
    throw new Error(`Builder JSON parsing failed: ${err.message}`)
  }

  if (!plan.programme?.title) {
    throw new Error('Builder output missing programme.title')
  }
  if (!Array.isArray(plan.sessions) || plan.sessions.length === 0) {
    throw new Error('Builder output missing sessions array')
  }

  // Sanitize goal_ids
  plan.programme.goal_ids = sanitizeUuidArray(plan.programme.goal_ids)
  for (const s of plan.sessions) {
    s.goal_ids = sanitizeUuidArray(s.goal_ids)
  }

  // Enrich exercises with technique cues from the pool
  const exerciseMap = {}
  for (const pool of sessionPools) {
    for (const ex of pool.exercises || []) {
      exerciseMap[ex.id] = ex
    }
  }
  for (const session of plan.sessions) {
    session.exercises = (session.exercises || []).map(ex => {
      const dbEx = ex.exercise_id ? exerciseMap[ex.exercise_id] : null
      return {
        ...ex,
        name:             ex.name             || dbEx?.name             || null,
        technique_start:  dbEx?.technique_start  || null,
        technique_move:   dbEx?.technique_move   || null,
        technique_avoid:  dbEx?.technique_avoid  || null,
        movement_pattern: dbEx?.movement_pattern || null,
        tier:             dbEx?.tier             ?? null,
      }
    })
  }

  // Merge blueprint metadata into plan
  plan.capability_gap_profile_json       = blueprint.capability_gap_profile          ?? null
  plan.programme_aim                     = plan.programme.programme_aim              ?? blueprint.programme_aim              ?? null
  plan.phase_aim                         = plan.phase_aim                            ?? blueprint.phase_aim                  ?? null
  plan.session_allocation_rationale      = plan.session_allocation_rationale         ?? blueprint.session_allocation_rationale ?? null
  plan.block_number                      = plan.block_number                         ?? blueprint.block_number               ?? 1

  console.log(`[runBuilder] Built "${plan.programme?.title}" — ${plan.sessions.length} sessions`)
  return plan
}

/**
 * Main pipeline: Architect → DB fetch → Builder → Save
 * Two API calls instead of one monolithic call.
 * Each call targets <20s, total pipeline <45s including DB operations.
 */
export async function generateRexPlan(userId, supabase, callClaude, onProgress) {
  try {
    // ── Fetch user context ──────────────────────────────────────────
    const contextResult = await buildContext(userId, 'rex')
    const userContext = contextResult.contextString

    // ── ARCHITECT: Clinical reasoning, Levels 1-5 ───────────────────
    // Uses Haiku — small, fast, cheap. No exercise data needed.
    onProgress?.('architect')
    const blueprint = await runArchitect(callClaude, userContext)
    console.log('[generateRexPlan] Architect complete')

    // ── DB FETCH: Query exercises per session from Blueprint ─────────
    // Blueprint specifies domain, max_tier, segment, movement_patterns
    // per session. queryExercises returns up to 8 matching exercises.
    onProgress?.('builder')
    const sessionPools = await Promise.all(
      blueprint.sessions.map(async session => {
        const exercises = await queryExercises(
          {
            domain:            session.domain,
            max_tier:          session.max_tier ?? blueprint.capability_gap_profile?.max_tier ?? 2,
            segment:           session.segment,
            movement_patterns: session.movement_patterns || [],
          },
          supabase
        )
        return { ...session, exercises }
      })
    )
    console.log(`[generateRexPlan] DB fetch complete — ${sessionPools.length} pools`)

    // ── BUILDER: Exercise assignment, Level 6 ────────────────────────
    // Uses Sonnet — structured assignment against known exercise IDs.
    const plan = await runBuilder(callClaude, blueprint, sessionPools)
    console.log('[generateRexPlan] Builder complete')

    // ── SAVE ────────────────────────────────────────────────────────
    onProgress?.('saving')
    const programmeData = {
      ...plan.programme,
      capability_gap_profile_json: plan.capability_gap_profile_json ?? null,
      programme_aim:               plan.programme_aim               ?? null,
      start_date:                  new Date().toISOString().slice(0, 10),
    }

    const { data: programmeRow, error: progError } = await createProgramme(userId, programmeData)
    if (progError || !programmeRow) {
      throw new Error(`Failed to save programme: ${progError?.message || 'no row returned'}`)
    }

    const sessionRows = (plan.sessions || []).map((s, i) => {
      const allEx = s.exercises || []
      return {
        week_number:                  s.week_number    ?? 1,
        session_number:               s.session_number ?? i + 1,
        day_of_week:                  s.day_of_week,
        session_type:                 s.session_type,
        title:                        s.title,
        purpose_note:                 s.purpose_note,
        goal_ids:                     s.goal_ids        || [],
        duration_mins:                s.duration_mins,
        warm_up_json:                 allEx.filter(e => e.slot === 'warm_up'),
        exercises_json:               allEx.filter(e => e.slot === 'main'),
        cool_down_json:               allEx.filter(e => e.slot === 'cool_down'),
        block_number:                 plan.block_number                  ?? 1,
        phase_aim:                    plan.phase_aim                     ?? null,
        session_allocation_rationale: plan.session_allocation_rationale  ?? null,
        progression_note:             plan.programme?.progression_summary ?? null,
        coach_note:                   null,
        status:                       'planned',
        sessions_planned_id:          null,
        scheduled_date:               null,
      }
    })

    const { data: savedSessions, error: sessError } = await saveProgrammeSessions(
      programmeRow.id,
      userId,
      sessionRows
    )
    if (sessError) {
      throw new Error(`Failed to save programme sessions: ${sessError.message}`)
    }

    console.log(
      `[generateRexPlan] Saved "${programmeRow.title}" ` +
      `(${programmeRow.id}) with ${(savedSessions || []).length} sessions`
    )
    return { programme: programmeRow, sessions: savedSessions || [] }

  } catch (err) {
    console.error('[generateRexPlan] Pipeline failed:', err.message)
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

Return ONLY a JSON array (no markdown, no prose) with ${week1Sessions.length} session objects.
Output ONLY the fields that change week to week — do NOT include warm_up_json or cool_down_json:
[
  {
    "session_number": 1,
    "title": "5 words max",
    "purpose_note": "One sentence ending with a full stop.",
    "exercises_json": [{"exercise_id": "EXACT UUID from Week 1 — never change", "sets": 3, "reps": 12, "weight_kg": null, "rest_secs": 60}]
  }
]

Rules:
- exercise_id values MUST be copied exactly from Week 1 — never invent or change them
- Apply the overload strategy: adjust sets, reps, or weight_kg compared to Week 1
- Do NOT output warm_up_json or cool_down_json — they are carried over automatically
- Output ONLY the JSON array`

  const raw = await makeClaudeCall(
    system,
    `Generate Week ${targetWeek} sessions (${week1Sessions.length} sessions) applying: ${phase.overload_strategy}`,
    2048,
    { persona: 'rex', mode: 'programme_generation' },
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
        name:             base?.name             ?? ex.name             ?? null,
        technique_start:  base?.technique_start  ?? ex.technique_start  ?? null,
        technique_move:   base?.technique_move   ?? ex.technique_move   ?? null,
        technique_avoid:  base?.technique_avoid  ?? ex.technique_avoid  ?? null,
        movement_pattern: base?.movement_pattern ?? ex.movement_pattern ?? null,
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
      block_number:        Math.ceil(targetWeek / 2),  // weeks 1-2 → block 1, 3-4 → block 2, etc.
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
