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
 * Generates the complete programme plan in a single API call.
 *
 * Rex receives the full exercise pools and outputs one JSON object containing
 * the programme header (with capability_gap_profile, programme_aim) plus all
 * sessions with exercises tagged by slot (warm_up / main / cool_down).
 *
 * Uses max_tokens=4096 and no streaming so we receive the complete JSON at once.
 *
 * @param {Function} callClaude
 * @param {string}   userContext  - Formatted context string from buildContext
 * @param {Array}    sessionPools - Array of { day, domain, segment, duration_mins, intensity, exercises[] }
 * @returns {Promise<object>} Parsed plan object: { programme, phase_aim, session_allocation_rationale, block_number, weeks_in_block, sessions }
 */
async function generateFullPlan(callClaude, userContext, sessionPools) {
  // Keep pool entries lean — Claude only needs id + name to assign exercises.
  // Verbose fields (movement_pattern, tier, segment, equipment) bloat the input
  // and increase time-to-first-token significantly for large programmes.
  const sessionBlocks = sessionPools.map((session, i) => {
    const exList = (session.exercises || []).map(e =>
      `  id="${e.id}" | "${e.name}"`
    ).join('\n')
    return (
      `Session ${i + 1} — ${session.day} | domain: ${session.domain} | ` +
      `max_tier: ${session.max_tier ?? 2} | segment: ${session.segment ?? 'full_body'} | ` +
      `${session.duration_mins ?? 45} mins | intensity: ${session.intensity ?? 'moderate'}\n` +
      `Available exercises:\n${exList || '  (none matched)'}`
    )
  }).join('\n\n')

  const system = `You are Rex. Work through all 6 levels of #PROGRAMME INTELLIGENCE and output a single valid JSON object. No prose. No markdown. No code fences.

USER CONTEXT:
${userContext}

SESSION EXERCISE POOLS:
${sessionBlocks}

Output this exact JSON structure — WEEK 1 SESSIONS ONLY (weeks 2-4 are generated progressively later):
{
  "programme": {
    "title": "string",
    "description": "string — 1-2 sentences",
    "total_weeks": 4,
    "goal_ids": [],
    "phase_structure_json": [{"phase": 1, "weeks": "1-2", "label": "Foundation", "focus": "string", "overload_strategy": "string"}, {"phase": 2, "weeks": "3-4", "label": "Build", "focus": "string", "overload_strategy": "string"}],
    "progression_summary": "string",
    "created_by": "rex_initial",
    "programme_aim": "string — 2-3 sentences from Level 3 goal task analysis",
    "capability_gap_profile_json": {"goal_task_analysis": "string", "gaps_identified": ["string"], "horak_resources_flagged": ["string"]}
  },
  "phase_aim": "string — 2 sentences from Level 4",
  "session_allocation_rationale": "string — 2-3 sentences from Level 5, shown to user",
  "block_number": 1,
  "sessions": [
    {
      "week_number": 1,
      "session_number": 1,
      "day_of_week": "Monday",
      "session_type": "string",
      "title": "5 words max",
      "purpose_note": "One sentence ending with a full stop.",
      "goal_ids": [],
      "duration_mins": 45,
      "exercises": [
        {
          "exercise_id": "UUID — exact match from pool, or null for warm_up/cool_down",
          "exercise_name": "string",
          "slot": "warm_up",
          "sets": 1,
          "reps_min": null,
          "reps_max": null,
          "load_guidance": "string or null",
          "rest_secs": 0,
          "precaution_note": null
        }
      ]
    }
  ]
}

Rules:
- sessions array must contain ONLY week_number: 1 sessions — do NOT generate weeks 2, 3, or 4
- goal_ids: valid UUID arrays from context only, or []
- exercise_id: exact UUID from pool for main exercises — never invent. Use null for warm_up and cool_down.
- slot: must be exactly "warm_up", "main", or "cool_down"
- Each session must have 2-3 warm_up exercises, 4-5 main exercises, 2-3 cool_down exercises
- created_by must be exactly "rex_initial"
- Output ONLY the JSON — no markdown, no code fences, no prose`

  const raw = await callClaude(system, 'Build the Week 1 programme template.', 2048)

  let parsed
  try {
    const jsonStr = extractJson(raw).replace(/:_(\d)/g, ': $1')
    parsed = JSON.parse(jsonStr)
  } catch (parseErr) {
    console.error('[generateFullPlan] JSON parse failed. Raw response:', raw)
    throw new Error(`Programme JSON parsing failed: ${parseErr.message}`)
  }

  // ── Validate required fields — do not proceed with partial data ────────────
  if (!parsed.programme?.title) {
    throw new Error('Programme JSON missing required field: programme.title')
  }
  if (!Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
    throw new Error('Programme JSON missing required field: sessions (empty or not an array)')
  }
  if (!parsed.programme_aim && !parsed.programme?.programme_aim) {
    console.warn('[generateFullPlan] programme_aim not present — proceeding with null')
  }

  // ── Sanitize goal_ids ──────────────────────────────────────────────────────
  parsed.programme.goal_ids = sanitizeUuidArray(parsed.programme.goal_ids)
  for (const s of parsed.sessions) {
    s.goal_ids = sanitizeUuidArray(s.goal_ids)
  }

  // ── Enrich exercises from pool ──────────────────────────────────────────────
  const exerciseMap = {}
  for (const pool of sessionPools) {
    for (const ex of pool.exercises || []) {
      exerciseMap[ex.id] = ex
    }
  }

  for (const session of parsed.sessions) {
    session.exercises = (session.exercises || []).map(ex => {
      const dbEx = ex.exercise_id ? exerciseMap[ex.exercise_id] : null
      return {
        ...ex,
        name:             ex.exercise_name || dbEx?.name || null,
        technique_start:  dbEx?.technique_start  || null,
        technique_move:   dbEx?.technique_move   || null,
        technique_avoid:  dbEx?.technique_avoid  || null,
        movement_pattern: dbEx?.movement_pattern || null,
        tier:             dbEx?.tier             ?? null,
      }
    })
  }

  console.log(
    `[generateFullPlan] Generated "${parsed.programme?.title}" — ` +
    `${parsed.sessions.length} sessions, block ${parsed.block_number ?? 1}`
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
    let phase1Meta = {}
    try {
      const parsed = JSON.parse(extractJson(phase1Raw))
      sessionRequirements = parsed.sessions
      if (!Array.isArray(sessionRequirements) || sessionRequirements.length === 0) {
        throw new Error('sessions array is empty or missing')
      }
      // Capture top-level Phase 1 metadata for use in Phase 3 context
      phase1Meta = {
        capability_summary:          parsed.capability_summary          || null,
        session_allocation_rationale: parsed.session_allocation_rationale || null,
      }
    } catch (parseErr) {
      console.error('[generateRexPlan] Phase 1 JSON parse failed. Raw response:', phase1Raw)
      throw new Error(`Phase 1 JSON parsing failed: ${parseErr.message}`)
    }

    console.log(`[generateRexPlan] Phase 1 complete — ${sessionRequirements.length} sessions planned`)

    // ── PHASE 2: Fetch targeted exercises per session ───────────────────────
    // queryExercises queries alongside_exercises using domain, max_tier, segment,
    // and movement_patterns from Phase 1. Falls back to domain+tier if no precise match.

    const sessionPools = await Promise.all(
      sessionRequirements.map(async session => {
        const exercises = await queryExercises(
          {
            domain:            session.domain,
            max_tier:          session.max_tier,
            segment:           session.segment,
            movement_patterns: session.movement_patterns || [],
          },
          supabase
        )
        return { ...session, exercises }
      })
    )

    console.log(`[generateRexPlan] Phase 2 complete — exercise pools fetched for ${sessionPools.length} sessions`)

    // ── PHASE 3: Single call — full programme JSON ──────────────────────────
    // Rex receives all exercise pools and outputs a complete JSON object with
    // programme header, capability gap profile, programme_aim, phase_aim,
    // session_allocation_rationale, and all sessions with exercises by slot.

    console.log(`[generateRexPlan] Phase 2 complete — exercise pools fetched for ${sessionPools.length} sessions`)

    const plan = await generateFullPlan(callClaude, userContext, sessionPools)

    // ── Save to DB ──────────────────────────────────────────────────────────
    // 1. Build programme row — includes new fields from #PROGRAMME INTELLIGENCE output
    const programmeData = {
      ...plan.programme,
      capability_gap_profile_json: plan.programme.capability_gap_profile_json ?? null,
      programme_aim:               plan.programme.programme_aim               ?? null,
      start_date:                  new Date().toISOString().slice(0, 10),
    }

    const { data: programmeRow, error: progError } = await createProgramme(userId, programmeData)
    if (progError || !programmeRow) {
      throw new Error(`Failed to save programme: ${progError?.message || 'no row returned'}`)
    }

    // 2. Map sessions to DB rows — split exercises[] by slot into warm_up_json,
    //    exercises_json, and cool_down_json; attach new per-session fields.
    const sessionRows = (plan.sessions || []).map((s, i) => {
      const allEx     = s.exercises || []
      const warmUp    = allEx.filter(e => e.slot === 'warm_up')
      const main      = allEx.filter(e => e.slot === 'main')
      const coolDown  = allEx.filter(e => e.slot === 'cool_down')

      return {
        week_number:                   s.week_number    ?? 1,
        session_number:                s.session_number ?? i + 1,
        day_of_week:                   s.day_of_week,
        session_type:                  s.session_type,
        title:                         s.title,
        purpose_note:                  s.purpose_note,
        goal_ids:                      s.goal_ids        || [],
        duration_mins:                 s.duration_mins,
        warm_up_json:                  warmUp,
        exercises_json:                main,
        cool_down_json:                coolDown,
        block_number:                  plan.block_number   ?? 1,
        phase_aim:                     plan.phase_aim       ?? null,
        session_allocation_rationale:  plan.session_allocation_rationale ?? null,
        progression_note:              plan.programme?.progression_summary ?? null,
        coach_note:                    null,
        status:                        'planned',
        sessions_planned_id:           null,
        scheduled_date:                null,
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
      `[generateRexPlan] Saved programme "${programmeRow.title}" ` +
      `(${programmeRow.id}) with ${(savedSessions || []).length} sessions for user ${userId}`
    )

    return { programme: programmeRow, sessions: savedSessions || [] }

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
    8192,
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
