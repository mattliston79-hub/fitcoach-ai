import { supabase } from '../lib/supabase'
import { fetchConversationHistory } from './conversationMemory'
import { MINDFULNESS_PRACTICES, SIGNAL_MAP, BENEFITS } from './mindfulnessKnowledge.js'
import { getFullProgramme } from './programmeService'

/**
 * Derives a traffic-light recovery status from the most recent recovery log.
 * Red:   soreness >= 4 OR energy <= 2
 * Amber: soreness == 3 OR energy == 3
 * Green: soreness <= 2 AND energy >= 4
 */
function deriveRecoveryStatus(log) {
  if (!log) return 'unknown'
  if (log.soreness_score >= 4 || log.energy_score <= 2) return 'red'
  if (log.soreness_score === 3 || log.energy_score === 3) return 'amber'
  return 'green'
}

/**
 * Scans the last 4 messages for mindfulness signal keywords.
 * Returns the matching practice key (priority 1 first), or null.
 */
function detectMindfulnessSignal(messages = []) {
  const recent = messages.slice(-4).map(m => m.content || '').join(' ').toLowerCase()
  const sorted = [...SIGNAL_MAP].sort((a, b) => a.priority - b.priority)
  for (const entry of sorted) {
    if (entry.signals.some(s => recent.includes(s))) return entry.practice
  }
  return null
}

/**
 * Fetches all context data for a user and returns a formatted string
 * ready to be inserted into a Claude API system prompt.
 *
 * @param {string} userId - The authenticated user's UUID
 * @param {'fitz'|'rex'|null} persona - When provided, the last 5 conversation
 *   summaries for that persona are fetched and appended as memory context.
 * @param {Array} messages - Current conversation messages for signal detection.
 * @returns {Promise<string>} Formatted context block
 */
/**
 * Races a promise against a timeout. If the timeout fires first, resolves
 * with `fallback` instead of waiting forever for a slow/hung DB query.
 */
function withTimeout(promise, ms = 5000, fallback = { data: null }) {
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise(resolve => setTimeout(() => resolve(fallback), ms)),
  ])
}

/**
 * Fetches the two most recent PERMA and most recent IPAQ responses and
 * returns a formatted context block for Fitz to use naturally in conversation.
 */
async function getQuestionnaireContext(userId) {
  const [permaRes, ipaqRes] = await Promise.all([
    withTimeout(supabase
      .from('questionnaire_responses')
      .select('completed_at, score_summary')
      .eq('user_id', userId)
      .eq('questionnaire_type', 'perma')
      .order('completed_at', { ascending: false })
      .limit(2), 5000, { data: [] }),

    withTimeout(supabase
      .from('questionnaire_responses')
      .select('completed_at, score_summary')
      .eq('user_id', userId)
      .eq('questionnaire_type', 'ipaq')
      .order('completed_at', { ascending: false })
      .limit(1), 5000, { data: [] }),
  ])

  const permaRows = permaRes?.data ?? []
  const ipaqRows  = ipaqRes?.data  ?? []

  if (permaRows.length === 0 && ipaqRows.length === 0) {
    return `=== WELLBEING DATA (PERMA + IPAQ) ===
No questionnaire data recorded yet. The user has not yet completed their first check-in.`
  }

  const DOMAIN_LABELS = {
    P: 'Positive Emotion', E: 'Engagement', R: 'Relationships',
    M: 'Meaning', A: 'Accomplishment', N: 'Negative Emotion',
    H: 'Health', Lon: 'Loneliness', hap: 'Happiness', overall: 'Overall',
  }

  const fmtScore = (v) => (v !== null && v !== undefined) ? v.toFixed(1) : 'n/a'

  const latestPerma = permaRows[0] ?? null
  const prevPerma   = permaRows[1] ?? null
  const latestIpaq  = ipaqRows[0]  ?? null

  const permaLines = latestPerma
    ? Object.entries(DOMAIN_LABELS).map(([key, label]) => {
        const curr = latestPerma.score_summary?.[key] ?? null
        const prev = prevPerma?.score_summary?.[key]  ?? null
        const change = (curr !== null && prev !== null)
          ? ` (was ${fmtScore(prev)})`
          : ''
        return `  ${label}: ${fmtScore(curr)}${change}`
      })
    : ['  No PERMA data.']

  const ipaqLine = latestIpaq
    ? [
        `  Activity level: ${latestIpaq.score_summary?.activity_level ?? 'unknown'}`,
        `  Moderate-equiv mins/week: ${latestIpaq.score_summary?.moderate_equiv_mins_per_week ?? 'n/a'}`,
        `  Sitting mins/day: ${latestIpaq.score_summary?.sitting_mins_per_day ?? 'n/a'}`,
      ].join('\n')
    : '  No IPAQ data.'

  return `=== WELLBEING DATA (PERMA + IPAQ) ===
PERMA scores (0–10 scale, latest${prevPerma ? ' vs previous' : ''}):
${permaLines.join('\n')}
Assessed: ${latestPerma?.completed_at?.slice(0, 10) ?? 'unknown'}

Physical activity self-report (IPAQ):
${ipaqLine}
Assessed: ${latestIpaq?.completed_at?.slice(0, 10) ?? 'unknown'}`
}

export async function buildContext(userId, persona = null, messages = []) {
  const today        = new Date().toISOString().slice(0, 10)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const sevenDaysOut = new Date()
  sevenDaysOut.setDate(sevenDaysOut.getDate() + 7)

  // Run all independent queries in parallel, each with a 5 s timeout so a
  // hung Supabase query never blocks the entire context build.
  const [
    userResult, profileResult, goalsResult, recoveryResult,
    sessionsResult, historyBlock,
    wellbeingResult, socialResult, oakResult, mindfulnessResult,
    activityResult, mindfulnessSessionsResult, mindfulnessPlannedResult,
    crisisCountryResult, crisisFallbackResult,
    programmeResult,
    rexCoachingNotesResult,
  ] = await Promise.all([
    withTimeout(supabase
      .from('users')
      .select('name, email, onboarding_complete')
      .eq('id', userId)
      .single(), 5000, { data: {} }),

    withTimeout(supabase
      .from('user_profiles')
      .select(
        'experience_level, goals_summary, preferred_session_types, ' +
        'available_days, preferred_session_duration_mins, ' +
        'ipaq_category, ipaq_score_mets, perma_total_score, perma_subscores_json, ' +
        'limitations_json, preferred_equipment, preferred_location'
      )
      .eq('user_id', userId)
      .single(), 5000, { data: {} }),

    withTimeout(supabase
      .from('goals')
      .select('goal_statement, status, created_at, last_reviewed_at, domain, coach')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }), 5000, { data: [] }),

    withTimeout(supabase
      .from('recovery_logs')
      .select('date, soreness_score, energy_score, sleep_quality, notes')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(3), 5000, { data: [] }),

    withTimeout(supabase
      .from('sessions_logged')
      .select('date, session_type, duration_mins, rpe, notes')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(5), 5000, { data: [] }),

    // Conversation memory — null-safe (returns '' if no persona or no history)
    withTimeout(
      persona ? fetchConversationHistory(userId, persona) : Promise.resolve(''),
      5000, ''
    ),

    // 7. Wellbeing logs — last 7 days
    withTimeout(supabase
      .from('wellbeing_logs')
      .select('date, mood_score, energy_score, sleep_quality, social_connection_score')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(7)),

    // 8. Social activity logs — last 7 days
    withTimeout(supabase
      .from('social_activity_logs')
      .select('date, activity_description, with_others')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(7)),

    // 9. Oak tree state
    withTimeout(supabase
      .from('oak_tree_states')
      .select('growth_stage, physical_score, social_score, emotional_score, balance_index, last_updated_at')
      .eq('user_id', userId)
      .maybeSingle()),

    // 10. Mindfulness logs — last 14 days
    withTimeout(supabase
      .from('mindfulness_logs')
      .select('date, script_slug, duration_mins, completed, audio_used')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(14)),

    // 11. Activity log — last 30 entries
    withTimeout(supabase
      .from('activity_log')
      .select('title, domain, activity_type, duration_mins, logged_at')
      .eq('user_id', userId)
      .order('logged_at', { ascending: false })
      .limit(30)),

    // 12. Mindfulness sessions this week
    withTimeout(supabase
      .from('sessions_logged')
      .select('date, session_type, practice_type, duration_mins, notes')
      .eq('user_id', userId)
      .eq('session_type', 'mindfulness')
      .gte('date', sevenDaysAgo.toISOString().slice(0, 10))
      .order('date', { ascending: false })),

    // 13. Mindfulness sessions planned next 7 days
    withTimeout(supabase
      .from('sessions_planned')
      .select('date, practice_type, duration_mins')
      .eq('user_id', userId)
      .eq('session_type', 'mindfulness')
      .gte('date', today)
      .lte('date', sevenDaysOut.toISOString().slice(0, 10))
      .order('date', { ascending: true })),

    // 14. Crisis resource (country-specific) — fetched in parallel now
    withTimeout(supabase
      .from('crisis_resources')
      .select('organisation, phone, url, country_code')
      .eq('is_fallback', false)
      .maybeSingle()),

    // 15. Crisis resource (global fallback)
    withTimeout(supabase
      .from('crisis_resources')
      .select('organisation, phone, url')
      .eq('is_fallback', true)
      .maybeSingle()),

    // 16. Active programme + sessions
    withTimeout(getFullProgramme(userId), 5000, { data: { programme: null, sessions: [] } }),

    // 17. Rex coaching notes (rex persona only — resolves immediately for Fitz)
    persona === 'rex'
      ? withTimeout(supabase
          .from('rex_coaching_notes')
          .select('id, category, body_area, note, note_type, severity, active, created_at')
          .eq('user_id', userId)
          .eq('active', true)
          .order('created_at', { ascending: false }), 5000, { data: [] })
      : Promise.resolve({ data: [] }),
  ])

  const user    = userResult.data    || {}
  const profile = profileResult.data || {}
  const goals   = goalsResult.data   || []
  const displayGoals = persona === 'rex'
    ? goals.filter(g => g.domain === 'physical' || g.coach === 'rex')
    : goals
  const recovery = recoveryResult.data || []
  const sessions = sessionsResult.data || []
  const wellbeingLogs   = wellbeingResult?.data   || []
  const socialLogs      = socialResult?.data       || []
  const oakTree         = oakResult?.data          || null
  const mindfulnessLogs = mindfulnessResult?.data  || []
  const activityLogs    = activityResult?.data     || []

  // Active programme — log error but degrade gracefully
  let activeProgramme = { programme: null, sessions: [] }
  if (programmeResult?.error) {
    console.error('[buildContext] getFullProgramme error:', programmeResult.error.message || programmeResult.error)
  } else {
    activeProgramme = programmeResult?.data || { programme: null, sessions: [] }
  }

  // Crisis resource — resolved in parallel above; country-specific preferred, fallback used otherwise
  const countryCode = profile.country_code || null
  const countryMatch = crisisCountryResult?.data
  const crisisResource = (countryMatch && (!countryCode || countryMatch.country_code === countryCode))
    ? countryMatch
    : (crisisFallbackResult?.data || null)

  // Wellbeing averages
  const avg = (arr, key) => arr.length
    ? Math.round(arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length * 10) / 10
    : null
  const avgMood   = avg(wellbeingLogs, 'mood_score')
  const avgSleep  = avg(wellbeingLogs, 'sleep_quality')
  const avgEnergy = avg(wellbeingLogs, 'energy_score')
  const avgSocial = avg(wellbeingLogs, 'social_connection_score')
  const socialActivityCount = socialLogs.length
  const mindfulnessCount     = mindfulnessLogs.filter(r => r.completed).length
  const lastMindfulnessDate  = mindfulnessLogs[0]?.date || null
  const mindfulnessScripts   = [...new Set(mindfulnessLogs.map(r => r.script_slug))].join(', ')

  const mindfulnessSessions        = mindfulnessSessionsResult?.data  || []
  const mindfulnessPlanned         = mindfulnessPlannedResult?.data   || []
  const mindfulnessMinutesThisWeek = mindfulnessSessions.reduce((sum, s) => sum + (s.duration_mins || 0), 0)

  const MINDFULNESS_LABELS = {
    body_scan: 'Body Scan', breath_focus: 'Breath Focus', grounding: 'Grounding',
    mindful_walking: 'Mindful Walk', nature_observation: 'Nature Pause', pre_sleep: 'Pre-Sleep',
  }

  // Derived values
  const latestRecovery   = recovery[0] || null
  const recoveryStatus   = deriveRecoveryStatus(latestRecovery)
  const sessionsPerWeek  = profile.available_days?.length ?? 'unknown'
  const sessionTypes     = profile.preferred_session_types?.join(', ') || 'not specified'

  // ── USER PROFILE ─────────────────────────────────────────────
  const profileSection = `=== USER PROFILE ===
Name:                    ${user.name || 'unknown'}
Experience level:        ${profile.experience_level || 'not set'}
Country:                 ${profile.country_code || 'not set'}
Goals summary:           ${profile.goals_summary || 'not yet set'}
Preferred session types: ${sessionTypes}
Sessions per week:       ${sessionsPerWeek}
Preferred duration:      ${profile.preferred_session_duration_mins ? `${profile.preferred_session_duration_mins} mins` : 'not set'}
Onboarding complete:     ${user.onboarding_complete ? 'yes' : 'no'}`

  // ── ACTIVE GOALS ─────────────────────────────────────────────
  const goalsSection = `=== ACTIVE GOALS ===
${displayGoals.length === 0
    ? 'No active goals recorded.'
    : displayGoals.map((g, i) => {
        const set = g.created_at ? new Date(g.created_at).toISOString().slice(0, 10) : '?'
        const reviewed = g.last_reviewed_at ? new Date(g.last_reviewed_at).toISOString().slice(0, 10) : 'never'
        return `${i + 1}. [id:${g.id}] ${g.goal_statement} (set ${set}, last reviewed ${reviewed})`
      }).join('\n')}`

  // ── RECENT RECOVERY ───────────────────────────────────────────
  const recoverySection = `=== RECENT RECOVERY ===
Current status: ${recoveryStatus.toUpperCase()}
${recovery.length === 0
    ? 'No recovery logs recorded.'
    : recovery.map(r => {
        const notes = r.notes ? ` | Notes: ${r.notes}` : ''
        return `${r.date}: Soreness ${r.soreness_score}/5 | Energy ${r.energy_score}/5 | Sleep ${r.sleep_quality}/5${notes}`
      }).join('\n')}`

  // ── RECENT SESSIONS ───────────────────────────────────────────
  const sessionsSection = `=== RECENT SESSIONS (last 5 completed) ===
${sessions.length === 0
    ? 'No sessions logged yet.'
    : sessions.map(s => {
        const duration = s.duration_mins ? `${s.duration_mins} mins` : 'duration not logged'
        const rpe      = s.rpe ? ` | RPE ${s.rpe}/10` : ''
        const notes    = s.notes ? ` | Notes: ${s.notes}` : ''
        return `${s.date}: ${s.session_type} — ${duration}${rpe}${notes}`
      }).join('\n')}`

  // ── CRISIS RESOURCES ──────────────────────────────────────────
  const crisisSection = `=== CRISIS RESOURCES ===
${crisisResource
    ? [
        `Organisation: ${crisisResource.organisation}`,
        crisisResource.phone ? `Phone:         ${crisisResource.phone}` : null,
        crisisResource.url   ? `URL:           ${crisisResource.url}`   : null,
      ].filter(Boolean).join('\n')
    : 'No crisis resource found for this user\'s country.'}`

  const wellbeingSection = `=== RECENT WELLBEING (last 7 days) ===
${wellbeingLogs.length === 0
  ? 'No wellbeing logs recorded this week.'
  : [
      avgMood   !== null ? `Avg mood: ${avgMood}/5`             : null,
      avgSleep  !== null ? `Avg sleep quality: ${avgSleep}/5`   : null,
      avgEnergy !== null ? `Avg energy: ${avgEnergy}/5`         : null,
      avgSocial !== null ? `Avg social connection: ${avgSocial}/5` : null,
      `Social activities logged this week: ${socialActivityCount}`,
    ].filter(Boolean).join('\n')
}`

  const STAGE_NAMES = ['', 'Acorn', 'Seedling', 'Sapling', 'Young oak', 'Established oak', 'Mature oak', 'Ancient oak']
  const oakSection = oakTree
    ? `=== OAK TREE ===
Growth stage: ${oakTree.growth_stage} (${STAGE_NAMES[oakTree.growth_stage] || 'Unknown'})
Physical score (water): ${oakTree.physical_score}/100
Social score (sunlight): ${oakTree.social_score}/100
Emotional score (soil): ${oakTree.emotional_score}/100
Balance index: ${oakTree.balance_index}/100`
    : `=== OAK TREE ===
No oak tree data yet.`

  const mindfulnessSection = `=== MINDFULNESS PRACTICE (last 14 days) ===
${mindfulnessLogs.length === 0
  ? 'No mindfulness sessions logged in the last 14 days.'
  : [
      `Completed sessions: ${mindfulnessCount}`,
      lastMindfulnessDate ? `Last practice: ${lastMindfulnessDate}` : null,
      mindfulnessScripts ? `Scripts used: ${mindfulnessScripts}` : null,
    ].filter(Boolean).join('\n')
}`

  const mindfulnessSessionsSection = `=== MINDFULNESS SESSIONS THIS WEEK ===
${mindfulnessSessions.length === 0
  ? 'No mindfulness sessions logged this week.'
  : [
      `Sessions: ${mindfulnessSessions.length}`,
      `Total minutes: ${mindfulnessMinutesThisWeek}`,
      ...mindfulnessSessions.map(s => {
        const label = MINDFULNESS_LABELS[s.practice_type] || s.practice_type || 'session'
        const notes = s.notes ? ` | Notes: ${s.notes}` : ''
        return `${s.date}: ${label} — ${s.duration_mins || '?'} mins${notes}`
      }),
    ].join('\n')
}`

  const mindfulnessPlannedSection = `=== MINDFULNESS PLANNED NEXT 7 DAYS ===
${mindfulnessPlanned.length === 0
  ? 'No mindfulness sessions planned for the week ahead.'
  : mindfulnessPlanned.map(s => {
      const label = MINDFULNESS_LABELS[s.practice_type] || s.practice_type || 'session'
      const dur   = s.duration_mins ? ` (${s.duration_mins} min)` : ''
      return `${s.date}: ${label}${dur}`
    }).join('\n')
}`

  // ── RECENT ACTIVITY ───────────────────────────────────────────
  let activitySection = null
  if (activityLogs.length > 0) {
    const byDomain = { physical: [], emotional: [], social: [] }
    for (const a of activityLogs) {
      if (byDomain[a.domain]) byDomain[a.domain].push(a)
    }

    const summariseDomain = (entries, label) => {
      if (entries.length === 0) return null
      const n = entries.length
      const unit = n === 1 ? 'activity' : 'activities'
      const counts = {}
      for (const e of entries) counts[e.title] = (counts[e.title] || 0) + 1
      const detail = Object.entries(counts)
        .map(([k, v]) => v > 1 ? `${k} x${v}` : k)
        .join(', ')
      return `${label}: ${n} ${unit} (${detail})`
    }

    const domainLines = [
      summariseDomain(byDomain.physical,  'Physical'),
      summariseDomain(byDomain.emotional, 'Emotional'),
      summariseDomain(byDomain.social,    'Social'),
    ].filter(Boolean)

    const recentLines = activityLogs.slice(0, 5).map(a => {
      const date = new Date(a.logged_at).toLocaleDateString('en-GB', {
        weekday: 'short', day: 'numeric', month: 'short',
      })
      const dur = a.duration_mins ? `, ${a.duration_mins} min` : ''
      return `- ${date} — ${a.title} (${a.domain}${dur})`
    })

    activitySection = `=== RECENT ACTIVITY (last 30 entries) ===
${domainLines.join('\n')}
Most recent:
${recentLines.join('\n')}`
  }

  const detectedPractice = detectMindfulnessSignal(messages)
  let availableScriptSection = null
  if (detectedPractice) {
    const practice = MINDFULNESS_PRACTICES[detectedPractice]
    const benefit  = BENEFITS[detectedPractice]
    if (practice) {
      availableScriptSection = `=== AVAILABLE_SCRIPT ===
Practice: ${practice.name} (${practice.duration_mins} min)
When to use: ${practice.brief_description}
Benefit to share with user: ${benefit}
Full script text:
${practice.script}`
    }
  }

  // ── CURRENT PROGRAMME ────────────────────────────────────────
  let programmeSection
  const prog = activeProgramme.programme

  if (!prog) {
    programmeSection = `=== CURRENT PROGRAMME ===
None. If the user asks about their programme or training plan, offer to build one.`
  } else {
    // Calculate current week number clamped to [1, total_weeks]
    const createdAt  = new Date(prog.created_at)
    const todayDate  = new Date(today)
    const daysDiff   = Math.floor((todayDate - createdAt) / (1000 * 60 * 60 * 24))
    const currentWeek = Math.min(Math.max(Math.ceil((daysDiff + 1) / 7), 1), prog.total_weeks)

    // Phase structure as plain text
    let phaseText = 'Not specified'
    if (Array.isArray(prog.phase_structure_json) && prog.phase_structure_json.length > 0) {
      phaseText = prog.phase_structure_json
        .map(p => `  Phase ${p.phase} (weeks ${p.weeks}): ${p.label} — ${p.focus}`)
        .join('\n')
    }

    // Sessions for current week — title, purpose_note, exercise names only
    const weekSessions = activeProgramme.sessions.filter(s => s.week_number === currentWeek)
    let weekSessionsText = 'No sessions scheduled for this week.'
    if (weekSessions.length > 0) {
      weekSessionsText = weekSessions.map(s => {
        const exerciseNames = Array.isArray(s.exercises_json)
          ? s.exercises_json.map(e => e.name).filter(Boolean).join(', ')
          : ''
        return [
          `  Session ${s.session_number}${s.day_of_week ? ` (${s.day_of_week})` : ''}: ${s.title}`,
          s.purpose_note ? `    Purpose: ${s.purpose_note}` : null,
          exerciseNames   ? `    Exercises: ${exerciseNames}` : null,
        ].filter(Boolean).join('\n')
      }).join('\n')
    }

    programmeSection = `=== CURRENT PROGRAMME ===
Title: ${prog.title}
Duration: ${prog.total_weeks} weeks
Current week: ${currentWeek}
Phase structure:
${phaseText}
Progression plan: ${prog.progression_summary || 'Not specified'}

SESSIONS — Week ${currentWeek}:
${weekSessionsText}`
  }

  // ── REX-ONLY: exercise feedback summaries ────────────────────
  // Fetched after activeProgramme resolves; skipped for Fitz entirely.
  let exerciseFeedbackLines = []
  if (persona === 'rex' && activeProgramme.sessions?.length > 0) {
    const exerciseMap = new Map() // exercise_id -> name
    for (const session of activeProgramme.sessions) {
      if (!Array.isArray(session.exercises_json)) continue
      for (const ex of session.exercises_json) {
        if (ex.exercise_id && ex.name && !exerciseMap.has(ex.exercise_id)) {
          exerciseMap.set(ex.exercise_id, ex.name)
        }
      }
    }

    if (exerciseMap.size > 0) {
      const feedbackResults = await Promise.all(
        [...exerciseMap.entries()].map(async ([exerciseId, name]) => {
          const result = await withTimeout(
            supabase.rpc('get_exercise_feedback_summary', { p_user_id: userId, p_exercise_id: exerciseId }),
            5000, { data: null }
          )
          return { name, fb: result?.data }
        })
      )
      for (const { name, fb } of feedbackResults) {
        if (!fb || !fb.sessions_with_feedback) continue
        // Compact pipe format: "RDL|C:2|L:1|V:3|trend:developing|load:appropriate"
        // C=coordination avg, L=load avg, V=reserve(volume) avg
        const parts = []
        if (fb.avg_coordination != null) parts.push(`C:${fb.avg_coordination}`)
        if (fb.avg_load         != null) parts.push(`L:${fb.avg_load}`)
        if (fb.avg_reserve      != null) parts.push(`V:${fb.avg_reserve}`)
        if (fb.coordination_trend)       parts.push(`trend:${fb.coordination_trend}`)
        if (fb.load_signal)              parts.push(`load:${fb.load_signal}`)
        if (fb.volume_signal)            parts.push(`vol:${fb.volume_signal}`)
        if (parts.length > 0) {
          exerciseFeedbackLines.push(`  ${name}|${parts.join('|')}`)
        }
      }
    }
  }

  const questionnaireContext = await getQuestionnaireContext(userId)

  const sections = [profileSection, goalsSection, recoverySection, sessionsSection, wellbeingSection, oakSection, mindfulnessSection, mindfulnessSessionsSection, mindfulnessPlannedSection, crisisSection, programmeSection, questionnaireContext]
  if (activitySection) sections.push(activitySection)
  if (availableScriptSection) sections.push(availableScriptSection)

  // ── REX-ONLY CONTEXT BLOCK ───────────────────────────────────────
  if (persona === 'rex') {
    // Limitations
    const lims = profile.limitations_json
    const limitationsLine = Array.isArray(lims) && lims.length > 0
      ? 'Flagged limitations: ' + lims.map(l => {
          let s = l.area
          if (l.severity) s += ` (${l.severity})`
          if (l.notes)    s += ` — ${l.notes}`
          return s
        }).join('; ')
      : 'No flagged limitations.'

    // IPAQ from profile
    const ipaqLine = profile.ipaq_category
      ? `Physical activity level: ${profile.ipaq_category}` +
        (profile.ipaq_score_mets != null ? ` (IPAQ: ${profile.ipaq_score_mets} MET-min/week)` : '')
      : null

    // PERMA summary from profile
    const permaLine = (() => {
      const total = profile.perma_total_score
      const subs  = profile.perma_subscores_json
      if (total == null && !subs) return null
      const subStr = ['P', 'E', 'R', 'M', 'A']
        .filter(k => subs?.[k] != null)
        .map(k => `${k}=${subs[k]}`)
        .join(', ')
      return `Wellbeing score: ${total != null ? `${total}/10` : '?'}` +
             (subStr ? ` (PERMA: ${subStr})` : '')
    })()

    // Equipment / location preference
    const equipLine = profile.preferred_equipment
      ? `Preferred equipment: ${profile.preferred_equipment}` : null
    const locLine = profile.preferred_location
      ? `Preferred location: ${profile.preferred_location}` : null

    // Exercise feedback
    const feedbackSection = exerciseFeedbackLines.length > 0
      ? `Ex feedback (C=coord,L=load,V=reserve 0-3):\n${exerciseFeedbackLines.join('\n')}`
      : null

    // Rex coaching notes
    const coachingNotes = rexCoachingNotesResult?.data ?? []
    if (coachingNotes.length > 0) {
      const notesText = coachingNotes.map(n => {
        const parts = []
        if (n.category && n.category !== 'general') parts.push(`[${n.category}]`)
        if (n.body_area) parts.push(n.body_area)
        if (n.severity)  parts.push(`severity:${n.severity}`)
        const prefix = parts.length > 0 ? parts.join(' ') + ' — ' : ''
        // Parse Pain/ROM scores from note string and append clinical interpretation
        let noteText = n.note || ''
        const painMatch = noteText.match(/Pain:\s*(\d+)\/5/)
        const romMatch  = noteText.match(/ROM:\s*(\d+)\/5/)
        const interpretations = []
        if (painMatch) {
          const p = parseInt(painMatch[1], 10)
          if (p >= 4) interpretations.push('avoid loading this area')
          else if (p >= 2) interpretations.push('reduce load, avoid pain-provocative movements')
          else interpretations.push('monitor, light load acceptable')
        }
        if (romMatch) {
          const r = parseInt(romMatch[1], 10)
          if (r <= 1) interpretations.push('very restricted ROM — substitute full-range movements')
          else if (r <= 3) interpretations.push('partial ROM — use shortened range or regression')
        }
        const interp = interpretations.length > 0 ? ` [${interpretations.join('; ')}]` : ''
        return `- ${prefix}${noteText}${interp}`
      }).join('\n')
      sections.push(`=== REX COACHING NOTES ===\n${notesText}`)
    }

    const rexLines = [limitationsLine, ipaqLine, permaLine, equipLine, locLine, feedbackSection]
      .filter(Boolean)

    if (rexLines.length > 0) {
      sections.push(`=== REX TRAINING CONTEXT ===\n${rexLines.join('\n')}`)
    }
  }

  if (historyBlock) sections.push(historyBlock)

  return {
    contextString:    sections.join('\n\n'),
    activeProgramme,
    crisisLineName:   crisisResource?.organisation ?? null,
    crisisLineNumber: crisisResource?.phone        ?? null,
  }
}
