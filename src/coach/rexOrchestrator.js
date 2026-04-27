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
import { createProgramme, saveProgrammeSessions } from './programmeService'
import { makeClaudeCall }                      from './claudeApi'
import { validateAndRepairSession } from './sessionValidator'

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
  // Replace literal control characters (newlines, tabs, carriage returns) that
  // appear inside JSON string values with a space. Models sometimes emit unescaped
  // newlines inside prose strings which make JSON.parse throw "Unterminated string".
  const sanitized = raw.replace(/"(?:[^"\\]|\\.)*"/g, m =>
    m.replace(/[\n\r\t]/g, ' ')
  )
  const stripped    = sanitized.replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
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

  // Response was truncated mid-stream. Close any open string then close open
  // braces/brackets so JSON.parse gets a structurally valid (if incomplete) value.
  let partial = stripped.slice(start)
  if (inString) partial += '"'
  for (let d = depth; d > 0; d--) partial += closeChar
  return partial
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

  let blueprint
  try {
    blueprint = JSON.parse(extractJson(raw))
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
 * SESSION IDENTITY PHASE:
 * Commits to the identity of one session before exercises are selected.
 * Model: Haiku, 800 tokens. Runs once per session inside the Builder loop.
 */
async function runSessionIdentity(callClaude, sessionSpec, userContextTrimmed, blockNumber, weeksInBlock) {
  const system = `You are Rex's session identity engine.
Commit to the identity of ONE session before exercises are selected.
Return ONLY valid JSON. No other text.

SESSION: ${sessionSpec.day} | ${sessionSpec.domain} | ${sessionSpec.segment || 'full_body'} | ${sessionSpec.session_type}
Duration: ${sessionSpec.duration_mins || 45} mins | Aim: ${sessionSpec.session_aim || ''}
Block ${blockNumber} of ${weeksInBlock} weeks

USER:
${JSON.stringify(userContextTrimmed, null, 2)}

Task:
1. State the PRIMARY DOMAIN and MOVEMENT THEME.
2. A supporting domain is the EXCEPTION, not the rule.
   Before adding any supporting domain, ask:
     Would a 100% primary-domain session fail to serve this user's goal?
   If the answer is no, set supporting_domains: [].
   A supporting domain is appropriate ONLY when:
     (a) The goal explicitly requires multi-domain capability
         (e.g. triathlon preparation, sport-specific conditioning), OR
     (b) A specific physical deficit named in gaps_identified in the Blueprint
         cannot be addressed at all by the primary domain exercises.
   These are NOT reasons to add a supporting domain:
     - "Balance is always good"
     - "Mobility helps everyone"
     - "A bit of cardio won't hurt"
     - The session is long enough to fit more
   A runner doing a strength session does not need cardio support.
   A Pilates session does not need strength support unless the Blueprint
   explicitly names loaded progressions as a capability gap.
   When in doubt: supporting_domains: []
3. Choose session_structure: strength_block | pilates_flow | flexibility_flow | hiit_circuit | cardio_activity
4. Choose prescription_style: sets_reps_weight | hold_seconds | reps_only | breath_cycles | duration_mins
5. Confirm SLOT VOCABULARY for your chosen session_structure.
   Choose the matching vocabulary and set slot_vocabulary_confirmed: true.
   strength_block   -> warm_up (2-3) | main (4-5) | cool_down (2-3)
   hiit_circuit     -> warm_up (2-3) | main (4-6 intervals) | cool_down (2-3)
   pilates_flow     -> centring_breath (1-2) | warm_up (3-4) | main (6-8) | integration (2-3) | restore (2-3)
   flexibility_flow -> dynamic (4-5) | mobility (5-7) | hold (3-4) | restore (2)
   cardio_activity  -> no exercises array. cardio_activity_json object only.
   If you cannot match your session_structure to a vocabulary above,
   set session_structure: "strength_block" and slot_vocabulary_confirmed: true.

Return ONLY this JSON, all strings on one line:
{"session_number":${sessionSpec.session_number || 1},"primary_domain":"string","primary_focus":"string","movement_theme":"string","supporting_domains":[{"domain":"string","clinical_justification":"string"}],"session_structure":"strength_block","prescription_style":"sets_reps_weight","slot_vocabulary_confirmed":true,"identity_reasoning":"2 sentences max"}`

  try {
    const raw = await callClaude(system, 'Generate session identity.', 800, { mode: 'programme_architect' })
    const parsed = JSON.parse(extractJson(raw))
    if (!parsed.session_number || !parsed.session_structure) {
      throw new Error('Missing required identity fields')
    }
    if (!parsed.slot_vocabulary_confirmed) {
      console.warn(`[runSessionIdentity] slot_vocabulary not confirmed — triggering fallback`)
      throw new Error('slot_vocabulary not confirmed')
    }
    console.log(`[runSessionIdentity] Session ${parsed.session_number}: ${parsed.session_structure} — ${parsed.movement_theme}`)
    return parsed
  } catch (err) {
    console.error(`[runSessionIdentity] Failed for session ${sessionSpec.session_number}:`, err.message)
    // Return a session_type-aware identity so the Builder receives the correct structure
    const structureByType = {
      gym_strength:    'strength_block',
      kettlebell:      'strength_block',
      hiit_bodyweight: 'hiit_circuit',
      yoga:            'flexibility_flow',
      pilates:         'pilates_flow',
      plyometrics:     'strength_block',
      coordination:    'strength_block',
      flexibility:     'flexibility_flow',
      mindfulness:     'pilates_flow',
    }
    const prescriptionByType = {
      gym_strength:    'sets_reps_weight',
      kettlebell:      'sets_reps_weight',
      hiit_bodyweight: 'reps_only',
      yoga:            'hold_seconds',
      pilates:         'reps_only',
      plyometrics:     'sets_reps_weight',
      coordination:    'reps_only',
      flexibility:     'hold_seconds',
      mindfulness:     'breath_cycles',
    }
    return {
      session_number:           sessionSpec.session_number || 1,
      primary_domain:           sessionSpec.domain,
      primary_focus:            sessionSpec.session_aim || sessionSpec.domain,
      movement_theme:           sessionSpec.session_type,
      supporting_domains:       [],
      session_structure:        structureByType[sessionSpec.session_type]    || 'strength_block',
      prescription_style:       prescriptionByType[sessionSpec.session_type] || 'sets_reps_weight',
      slot_vocabulary_confirmed: false,
      identity_reasoning:       'Fallback identity — identity phase failed.',
    }
  }
}

/**
 * BUILDER PHASE (Level 6):
 * Builds one session at a time to avoid output token limits.
 * Each call: ~600 input tokens, ~400 output tokens. Target: 5-8s per session on Sonnet.
 */
async function runBuilder(callClaude, blueprint, sessionPools, userContextTrimmed, onProgress, supabase) {
  const { buildAtomicSessionPrompt } = await import('./trainerPrompt')

  const contraindications = blueprint.capability_gap_profile?.hard_gates?.contraindications ?? []
  const builtSessions = []
  const sessionIdentities = []

  for (let i = 0; i < blueprint.sessions.length; i++) {
    const sessionSpec = { ...blueprint.sessions[i], session_number: i + 1 }
    const pool = sessionPools[i] ?? { exercises: [] }

    // Safety check: if pool is very small (< 3 exercises), fetch a broader
    // fallback from the same domain without movement pattern filtering
    if ((pool.exercises?.length ?? 0) < 3) {
      console.warn(`[runBuilder] Session ${i + 1} pool has only ${pool.exercises?.length ?? 0} exercises — fetching broader fallback`)
      const { data: fallbackEx } = await supabase
        .from('alongside_exercises')
        .select('id, name, movement_pattern, tier, segment, equipment, bilateral, load_bearing, contraindications, technique_start, technique_move, technique_avoid, domain, default_sets, default_reps_min, default_reps_max, default_rest_secs, laterality, prescription_type')
        .eq('domain', sessionSpec.domain)
        .lte('tier', sessionSpec.max_tier ?? 2)
        .limit(12)
      if (fallbackEx?.length > 0) {
        pool.exercises = fallbackEx
      }
    }

    // Session identity — commits to structure before exercise selection
    const identity = await runSessionIdentity(
      callClaude, sessionSpec, userContextTrimmed,
      blueprint.block_number ?? 1, blueprint.weeks_in_block ?? 4
    )
    sessionIdentities.push(identity)

    const system = buildAtomicSessionPrompt(sessionSpec, pool.exercises, contraindications, identity, builtSessions)
    // pilates_flow and flexibility_flow sessions have many exercises with long technique_cues
    // (inhale/exhale instructions per exercise), so need more output tokens
    const builderMaxTokens = ['pilates_flow', 'flexibility_flow'].includes(identity.session_structure) ? 4500 : 2500
    const raw = await callClaude(
      system,
      `Build session ${i + 1}: ${sessionSpec.day} ${sessionSpec.session_type}`,
      builderMaxTokens,
      { mode: 'programme_builder' }
    )

    let session
    try {
      const jsonStr = extractJson(raw).replace(/:_(\d)/g, ': $1')
      session = JSON.parse(jsonStr)
    } catch (err) {
      console.error(`[runBuilder] Session ${i + 1} parse failed. Raw:`, raw)
      throw new Error(`Builder session ${i + 1} JSON parsing failed: ${err.message}`)
    }

    // Enrich exercises with technique cues from the pool
    const exerciseMap = {}
    for (const ex of pool.exercises || []) {
      exerciseMap[ex.id] = ex
    }
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

    const { session: repairedSession, repairs, clinicalFlags } =
      validateAndRepairSession(
        session,
        identity,
        pool.exercises,
        contraindications
      )

    if (repairs.length > 0) {
      console.log(
        `[validator] Session ${i + 1} — ${repairs.length} repair(s):`,
        repairs.join(' | ')
      )
    }

    if (clinicalFlags.length > 0) {
      clinicalFlags.forEach(flag =>
        console.warn(`[validator] CLINICAL FLAG session ${i + 1}:`, flag)
      )
    }

    builtSessions.push(repairedSession)
    onProgress?.('builder', i + 1, blueprint.sessions.length)
    console.log(`[runBuilder] Session ${i + 1}/${blueprint.sessions.length} built: ${session.title}`)
  }

  // Merge blueprint metadata into the plan object
  return {
    programme: {
      title: builtSessions.map(s => s.session_type).join(' / ').slice(0, 40) || 'Your Training Programme',
      total_weeks: 4,
      phase_structure_json: [
        { phase: 1, weeks: '1-2', label: 'Foundation',
          focus: 'Movement quality and base fitness',
          overload_strategy: 'Increase reps before load' },
        { phase: 2, weeks: '3-4', label: 'Build',
          focus: 'Progressive overload',
          overload_strategy: 'Increase load when top of rep range achieved' },
      ],
      progression_summary: blueprint.phase_aim || 'Progressive overload across 4 weeks.',
      created_by: 'rex_initial',
      programme_aim: blueprint.programme_aim || null,
      goal_id: null,
    },
    sessions: builtSessions,
    sessionIdentities,
    capability_gap_profile_json:  blueprint.capability_gap_profile          ?? null,
    programme_aim:                blueprint.programme_aim                   ?? null,
    phase_aim:                    blueprint.phase_aim                       ?? null,
    session_allocation_rationale: blueprint.session_allocation_rationale    ?? null,
    block_number:                 blueprint.block_number                    ?? 1,
  }
}

function calculateDateFromDay(startDateStr, weekNumber, dayName, sessionNumber) {
  const startDate = new Date(startDateStr)
  
  if (!dayName) {
     const sessionDate = new Date(startDate)
     sessionDate.setDate(sessionDate.getDate() + ((weekNumber - 1) * 7) + ((sessionNumber - 1) * 2))
     return sessionDate.toISOString().slice(0, 10)
  }

  const daysOfWeek = {
    'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3, 
    'thursday': 4, 'friday': 5, 'saturday': 6
  }

  const targetDayMap = {
    'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6, 'sun': 0
  }

  const lowerDay = dayName.toLowerCase()
  let targetDayInt = daysOfWeek[lowerDay]
  if (targetDayInt === undefined) {
    const prefix = lowerDay.slice(0, 3)
    targetDayInt = targetDayMap[prefix]
  }

  if (targetDayInt === undefined) {
     const sessionDate = new Date(startDate)
     sessionDate.setDate(sessionDate.getDate() + ((weekNumber - 1) * 7) + ((sessionNumber - 1) * 2))
     return sessionDate.toISOString().slice(0, 10)
  }

  const startDayInt = startDate.getDay()
  let daysToTarget = targetDayInt - startDayInt
  if (daysToTarget < 0) {
    daysToTarget += 7
  }
  
  const totalDaysToAdd = daysToTarget + ((weekNumber - 1) * 7)
  const sessionDate = new Date(startDate)
  sessionDate.setDate(sessionDate.getDate() + totalDaysToAdd)
  return sessionDate.toISOString().slice(0, 10)
}

/**
 * Main pipeline: Architect → DB fetch → Builder → Save
 * Two API calls instead of one monolithic call.
 * Each call targets <20s, total pipeline <45s including DB operations.
 */
export async function generateRexPlan(userId, supabase, callClaude, onProgress, hardwiredSchedule = null) {
  try {
    // ── Fetch user context ──────────────────────────────────────────
    const contextResult = await buildContext(userId, 'rex')
    let userContext = contextResult.contextString
    
    if (hardwiredSchedule && Array.isArray(hardwiredSchedule) && hardwiredSchedule.length > 0) {
      userContext += `\n\nUSER HARDWIRED SCHEDULE PREFERENCE:\n${JSON.stringify(hardwiredSchedule, null, 2)}\n`
    }

    // ── Build trimmed user context for session identity phase ───────
    // Only the fields the identity engine needs — avoids polluting the prompt
    const [profileResult, recoveryResult] = await Promise.all([
      supabase
        .from('user_profiles')
        .select('goals_summary, experience_level, preferred_session_types')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('recovery_logs')
        .select('soreness_score, energy_score')
        .eq('user_id', userId)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    const userContextTrimmed = {
      goals_summary:           profileResult.data?.goals_summary           ?? null,
      experience_level:        profileResult.data?.experience_level        ?? null,
      preferred_session_types: profileResult.data?.preferred_session_types ?? [],
      recovery_status: recoveryResult.data
        ? { soreness: recoveryResult.data.soreness_score, energy: recoveryResult.data.energy_score }
        : null,
    }

    // ── ARCHITECT: Clinical reasoning, Levels 1-5 ───────────────────
    // Uses Haiku — small, fast, cheap. No exercise data needed.
    onProgress?.('architect')
    const blueprint = await runArchitect(callClaude, userContext)
    console.log('[generateRexPlan] Architect complete')

    // ── DB FETCH: Query exercises per session from Blueprint ─────────
    // Blueprint specifies domain, max_tier, segment, movement_patterns
    // per session. queryExercises returns up to 8 matching exercises.
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
    const plan = await runBuilder(callClaude, blueprint, sessionPools, userContextTrimmed, onProgress, supabase)
    console.log('[generateRexPlan] Builder complete')

    // ── SAVE ────────────────────────────────────────────────────────
    onProgress?.('saving')
    const programmeData = {
      ...plan.programme,
      capability_gap_profile_json: plan.capability_gap_profile_json ?? null,
      programme_aim:               plan.programme_aim               ?? null,
      start_date:                  new Date().toISOString().slice(0, 10),
      status:                      'active',
    }

    const { data: programmeRow, error: progError } = await createProgramme(userId, programmeData)
    if (progError || !programmeRow) {
      throw new Error(`Failed to save programme: ${progError?.message || 'no row returned'}`)
    }

    const startDateStr = programmeData.start_date

    const sessionRows = (plan.sessions || []).map((s, i) => {
      const allEx = s.exercises || []
      const weekNumber = s.week_number ?? 1
      const sessionNumber = s.session_number ?? i + 1

      const sessionDateStr = s.date || calculateDateFromDay(startDateStr, weekNumber, s.day || s.session_label, sessionNumber)

      return {
        week_number:                  weekNumber,
        session_number:               sessionNumber,
        date:                         sessionDateStr,
        session_type:                 s.session_type,
        title:                        s.title,
        purpose_note:                 s.purpose_note,
        goal_id:                      s.goal_id         || null,
        duration_mins:                s.duration_mins,
        warm_up_json:                 allEx.filter(e => ['warm_up', 'centring_breath', 'dynamic'].includes(e.slot)),
        exercises_json:               allEx.filter(e => ['main', 'mobility', 'hold'].includes(e.slot)),
        cool_down_json:               allEx.filter(e => ['cool_down', 'integration', 'restore'].includes(e.slot)),
        cardio_activity_json:         s.cardio_activity_json || null,
        block_number:                 plan.block_number                  ?? 1,
        phase_aim:                    plan.phase_aim                     ?? null,
        session_allocation_rationale: plan.session_allocation_rationale  ?? null,
        progression_note:             plan.programme?.progression_summary ?? null,
        coach_note:                   null,
        status:                       'planned',
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

    let allSavedSessions = [...(savedSessions || [])]

    // Save session identities to the programme row
    if (plan.sessionIdentities?.length > 0) {
      const { error: identityError } = await supabase
        .from('programmes')
        .update({
          session_identities:      plan.sessionIdentities,
          identity_generated_at:   new Date().toISOString(),
        })
        .eq('id', programmeRow.id)
      if (identityError) {
        console.error('[generateRexPlan] Failed to save session_identities:', identityError.message)
      }
    }

    // ── AUTO-GENERATE SUBSEQUENT WEEKS IN BLOCK ─────────────────────
    if (plan.block_weeks) {
      const parts = String(plan.block_weeks).split('-').map(Number)
      const startWeek = parts[0] || 1
      const endWeek = parts[1] || startWeek

      if (endWeek > startWeek) {
        for (let targetWeek = startWeek + 1; targetWeek <= endWeek; targetWeek++) {
          onProgress?.('building_subsequent', targetWeek, endWeek)
          try {
            console.log(`[generateRexPlan] Auto-generating Week ${targetWeek}...`)
            const nextWeekData = await generateNextWeek(programmeRow, savedSessions, targetWeek, userId, supabase)
            
            if (nextWeekData.data) {
              allSavedSessions = [...allSavedSessions, ...nextWeekData.data]
            }
          } catch (err) {
            console.error(`[generateRexPlan] Failed to auto-generate Week ${targetWeek}:`, err)
            // Continue the loop even if one week fails, to not abort the whole programme
          }
        }
      }
    }

    console.log(
      `[generateRexPlan] Saved "${programmeRow.title}" ` +
      `(${programmeRow.id}) with ${allSavedSessions.length} sessions`
    )
    return { programme: programmeRow, sessions: allSavedSessions }

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

    let sessionDateStr = null
    if (template.date) {
      const d = new Date(template.date)
      d.setDate(d.getDate() + ((targetWeek - template.week_number) * 7))
      sessionDateStr = d.toISOString().slice(0, 10)
    } else {
      sessionDateStr = calculateDateFromDay(programme.start_date, targetWeek, template.day || template.title, template.session_number)
    }

    return {
      programme_id:        programme.id,
      user_id:             userId,
      week_number:         targetWeek,
      session_number:      template.session_number,
      date:                sessionDateStr,
      session_type:        template.session_type,
      title:               generated.title        ?? template.title,
      purpose_note:        generated.purpose_note ?? template.purpose_note,
      goal_id:             template.goal_id       ?? null,
      duration_mins:       template.duration_mins,
      warm_up_json:        generated.warm_up_json  ?? template.warm_up_json  ?? [],
      exercises_json:      enrichedExercises,
      cool_down_json:      generated.cool_down_json ?? template.cool_down_json ?? [],
      coach_note:          null,
      block_number:        Math.ceil(targetWeek / 2),
      progression_note:    `Week ${targetWeek} — ${phase.overload_strategy}`,
      status:              'planned',
    }
  })

  const { data, error } = await supabaseClient
    .from('sessions_planned')
    .insert(newRows)
    .select()

  if (error) {
    console.error(`[generateNextWeek] DB insert failed:`, error.message)
  } else {
    console.log(`[generateNextWeek] Saved ${(data ?? []).length} sessions for Week ${targetWeek}`)
  }

  return { data: data ?? null, error: error ?? null }
}

/**
 * Single Session Pipeline: Identity → DB fetch → Builder → Save to sessions_planned
 * Used when Rex generates an ad-hoc session via the save_plan tool.
 */
export async function generateSingleSession(userId, supabase, callClaude, sessionSpec) {
  try {
    const { session_type, date, title, duration_mins, purpose_note, goal_id } = sessionSpec
    
    // Cardio bypass: no exercise selection needed
    const CARDIO_TYPES = ['run', 'swim', 'ride', 'row', 'walk']
    if (CARDIO_TYPES.includes(session_type) || sessionSpec.cardio_activity) {
      console.log(`[generateSingleSession] Cardio bypass for ${session_type}`)
      const safeType = (session_type || 'gym_strength').toLowerCase()
      const { error } = await supabase.from('sessions_planned').insert({
        user_id: userId,
        date: date || new Date().toISOString().slice(0, 10),
        session_type: safeType,
        title: title || `${safeType.charAt(0).toUpperCase() + safeType.slice(1)} Session`,
        duration_mins: duration_mins || 30,
        purpose_note: purpose_note || 'Cardio session.',
        goal_id: goal_id || null,
        exercises_json: [],
        cardio_activity_json: sessionSpec.cardio_activity || null,
        status: 'planned'
      })
      if (error) throw error
      return { success: true }
    }

    // Map session_type to domain
    const domainMap = {
      pilates: 'movement',
      yoga: 'movement',
      gym_strength: 'strength',
      kettlebell: 'strength',
      hiit_bodyweight: 'strength',
      plyometrics: 'strength',
      coordination: 'movement',
      flexibility: 'movement',
      mindfulness: 'mindfulness',
    }
    const domain = domainMap[session_type] || 'strength'

    // Fetch user profile for context
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('goals_summary, experience_level, preferred_session_types')
      .eq('user_id', userId)
      .maybeSingle()
      
    const userContextTrimmed = {
      goals_summary: profile?.goals_summary || null,
      experience_level: profile?.experience_level || null,
      preferred_session_types: profile?.preferred_session_types || [],
      recovery_status: null
    }

    // Fetch exercises pool
    const exercises = await queryExercises({ domain, max_tier: 2 }, supabase)
    const pool = { exercises }
    
    // Safety check fallback
    if ((pool.exercises?.length ?? 0) < 3) {
      const { data: fallbackEx } = await supabase
        .from('alongside_exercises')
        .select('id, name, movement_pattern, tier, segment, equipment, bilateral, load_bearing, contraindications, technique_start, technique_move, technique_avoid, domain, default_sets, default_reps_min, default_reps_max, default_rest_secs, laterality, prescription_type')
        .eq('domain', domain)
        .lte('tier', 2)
        .limit(12)
      if (fallbackEx?.length > 0) {
        pool.exercises = fallbackEx
      }
    }

    // Identity phase
    const extendedSpec = { ...sessionSpec, domain, session_number: 1, session_aim: purpose_note, day: 'Ad-hoc' }
    const identity = await runSessionIdentity(callClaude, extendedSpec, userContextTrimmed, 1, 1)

    // Builder phase
    const { buildAtomicSessionPrompt } = await import('./trainerPrompt')
    const system = buildAtomicSessionPrompt(extendedSpec, pool.exercises, [], identity, [])
    
    const builderMaxTokens = ['pilates_flow', 'flexibility_flow'].includes(identity.session_structure) ? 4500 : 2500
    const raw = await callClaude(system, `Build session: ${session_type} - ${title}`, builderMaxTokens, { mode: 'programme_builder' })

    let sessionJSON
    try {
      const jsonStr = extractJson(raw).replace(/:_(\d)/g, ': $1')
      sessionJSON = JSON.parse(jsonStr)
    } catch (err) {
      throw new Error(`Builder parsing failed: ${err.message}`)
    }

    // Enrich exercises
    const exerciseMap = {}
    for (const ex of pool.exercises || []) {
      exerciseMap[ex.id] = ex
    }
    
    const enrichedExercises = (sessionJSON.exercises || []).map(ex => {
      const dbEx = ex.exercise_id ? exerciseMap[ex.exercise_id] : null
      return {
        ...ex,
        name: ex.name || dbEx?.name || null,
        description_start: dbEx?.technique_start || null,
        description_move: dbEx?.technique_move || null,
        description_avoid: dbEx?.technique_avoid || null,
      }
    })
    
    const { session: validatedSession, repairs } = validateAndRepairSession({ ...sessionJSON, exercises: enrichedExercises })
    if (repairs.length > 0) {
      console.log(`[generateSingleSession] Repairs applied:`, repairs.join(' | '))
    }

    // Save to sessions_planned
    const safeType = (session_type || 'gym_strength').toLowerCase()
    const { error: dbError } = await supabase.from('sessions_planned').insert({
      user_id: userId,
      date: date || new Date().toISOString().slice(0, 10),
      session_type: safeType,
      title: title || `${safeType.charAt(0).toUpperCase() + safeType.slice(1)} Session`,
      duration_mins: duration_mins || 45,
      purpose_note: purpose_note || 'Single training session.',
      goal_id: goal_id || null,
      exercises_json: validatedSession.exercises || [],
      status: 'planned'
    })

    if (dbError) throw dbError
    
    console.log(`[generateSingleSession] Successfully saved single session: ${title}`)
    return { success: true }
    
  } catch (err) {
    console.error('[generateSingleSession] Pipeline failed:', err)
    throw err
  }
}

/**
 * Saves a fully generated 12-week programme directly to the database.
 * Used when Rex natively generates the full programme in chat.
 */
export async function saveRexProgramme(userId, supabaseClient, programmeData) {
  try {
    // Archive any existing active programme for this user
    const { error: archiveError } = await supabaseClient
      .from('programmes')
      .update({ status: 'archived' })
      .eq('user_id', userId)
      .eq('status', 'active')

    if (archiveError) {
      console.warn('[saveRexProgramme] Failed to archive existing programme:', archiveError.message)
    }

    // 1. Insert into programmes table
    const { data: programmeRow, error: progError } = await supabaseClient
      .from('programmes')
      .insert({
        user_id: userId,
        title: programmeData.programme.title || '12-Week Programme',
        goal_id: programmeData.programme.goal_id || null,
        start_date: programmeData.programme.start_date,
        block_1_focus: programmeData.programme.block_1_focus,
        block_2_focus: programmeData.programme.block_2_focus,
        block_3_focus: programmeData.programme.block_3_focus,
        block_4_focus: programmeData.programme.block_4_focus,
        status: 'active'
      })
      .select()
      .single()

    if (progError) throw progError

    // 2. Map and insert sessions to sessions_planned
    const sessionRows = (programmeData.sessions || []).map(s => ({
      user_id: userId,
      programme_id: programmeRow.id,
      block_number: s.block_number,
      week_number: s.week_number,
      date: s.date,
      session_type: s.session_type,
      title: s.title,
      purpose_note: s.purpose_note,
      duration_mins: s.duration_mins,
      exercises_json: s.exercises_json || [],
      status: 'planned'
    }))

    if (sessionRows.length > 0) {
      const { error: sessError } = await supabaseClient
        .from('sessions_planned')
        .insert(sessionRows)
      if (sessError) throw sessError
    }

    console.log(`[saveRexProgramme] Saved 12-week programme with ${sessionRows.length} sessions`)
    return { programme: programmeRow, sessions: sessionRows }
  } catch (err) {
    console.error('[saveRexProgramme] Failed:', err.message)
    throw err
  }
}

