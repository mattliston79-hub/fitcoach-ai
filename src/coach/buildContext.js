import { supabase } from '../lib/supabase'

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
 * Fetches all context data for a user and returns a formatted string
 * ready to be inserted into a Claude API system prompt.
 *
 * @param {string} userId - The authenticated user's UUID
 * @returns {Promise<string>} Formatted context block
 */
export async function buildContext(userId) {
  // Run all independent queries in parallel
  const [
    userResult,
    profileResult,
    goalsResult,
    recoveryResult,
    sessionsResult,
  ] = await Promise.all([
    supabase
      .from('users')
      .select('name, email, onboarding_complete')
      .eq('id', userId)
      .single(),

    supabase
      .from('user_profiles')
      .select(
        'experience_level, goals_summary, preferred_session_types, ' +
        'available_days, preferred_session_duration_mins, country_code'
      )
      .eq('user_id', userId)
      .single(),

    supabase
      .from('goals')
      .select('goal_statement, status, created_at, last_reviewed_at')
      .eq('user_id', userId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),

    supabase
      .from('recovery_logs')
      .select('date, soreness_score, energy_score, sleep_quality, notes')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(3),

    supabase
      .from('sessions_logged')
      .select('date, session_type, duration_mins, rpe, notes')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(5),
  ])

  const user    = userResult.data    || {}
  const profile = profileResult.data || {}
  const goals   = goalsResult.data   || []
  const recovery = recoveryResult.data || []
  const sessions = sessionsResult.data || []

  // Fetch crisis resource — try country match first, then global fallback
  const countryCode = profile.country_code || null
  let crisisResource = null

  if (countryCode) {
    const { data } = await supabase
      .from('crisis_resources')
      .select('organisation, phone, url')
      .eq('country_code', countryCode)
      .maybeSingle()
    crisisResource = data
  }

  if (!crisisResource) {
    const { data } = await supabase
      .from('crisis_resources')
      .select('organisation, phone, url')
      .eq('is_fallback', true)
      .maybeSingle()
    crisisResource = data
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
${goals.length === 0
    ? 'No active goals recorded.'
    : goals.map((g, i) => {
        const set = g.created_at ? new Date(g.created_at).toISOString().slice(0, 10) : '?'
        const reviewed = g.last_reviewed_at ? new Date(g.last_reviewed_at).toISOString().slice(0, 10) : 'never'
        return `${i + 1}. ${g.goal_statement} (set ${set}, last reviewed ${reviewed})`
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

  return [profileSection, goalsSection, recoverySection, sessionsSection, crisisSection].join('\n\n')
}
