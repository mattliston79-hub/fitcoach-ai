import { supabase } from '../lib/supabase'

// 40 weeks of full engagement = 100 points per domain = Mature Oak
// Each week contributes up to 100 / 40 = 2.5 points per domain
const WEEKS_TO_MATURE = 40

function getMondayOf(date) {
  const d = new Date(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Updates the oak tree on a weekly cadence only.
 *
 * Behaviour:
 * - Checks last_updated_at — if already updated this Mon–Sun window, returns early (no-op).
 * - Otherwise, tallies the PREVIOUS full week (Mon–Sun) of activity.
 * - Adds that week's normalised contribution to the cumulative domain scores.
 * - Stage 1 (Acorn) is locked until all three domains have contributed (score > 0).
 * - Calibrated so ~40 weeks of consistent effort reaches stage 6 (Mature Oak).
 *
 * Call fire-and-forget after any session, wellbeing log, social log, or mindfulness log.
 * The weekly gate ensures the tree only advances once per week regardless of how many
 * times this function is called.
 */
export async function calculateOakTreeState(userId) {
  if (!userId) return

  const today      = new Date()
  const thisMonday = getMondayOf(today)
  const thisWeekStart = thisMonday.toISOString().slice(0, 10)

  // Previous full week window (Mon–Sun before this Monday)
  const prevMonday = new Date(thisMonday)
  prevMonday.setDate(thisMonday.getDate() - 7)
  const prevSunday = new Date(thisMonday)
  prevSunday.setDate(thisMonday.getDate() - 1)
  const prevWeekStart = prevMonday.toISOString().slice(0, 10)
  const prevWeekEnd   = prevSunday.toISOString().slice(0, 10)

  try {
    // Fetch current cumulative state
    const { data: current } = await supabase
      .from('oak_tree_states')
      .select('physical_score, social_score, emotional_score, growth_stage, last_updated_at')
      .eq('user_id', userId)
      .maybeSingle()

    // ── Weekly gate: skip if already updated this week ─────────────────────
    if (current?.last_updated_at) {
      const lastWeekStart = getMondayOf(new Date(current.last_updated_at)).toISOString().slice(0, 10)
      if (lastWeekStart === thisWeekStart) return
    }

    // ── Fetch previous week's activity in parallel ─────────────────────────
    const [sessionsRes, wellbeingRes, socialRes, mindfulnessRes, loggedMindfulnessRes] = await Promise.all([
      supabase.from('sessions_logged')
        .select('date, duration_mins, rpe, social_context')
        .eq('user_id', userId)
        .gte('date', prevWeekStart).lte('date', prevWeekEnd),

      supabase.from('wellbeing_logs')
        .select('mood_score, energy_score, sleep_quality')
        .eq('user_id', userId)
        .gte('date', prevWeekStart).lte('date', prevWeekEnd),

      supabase.from('social_activity_logs')
        .select('date, with_others')
        .eq('user_id', userId)
        .gte('date', prevWeekStart).lte('date', prevWeekEnd),

      supabase.from('mindfulness_logs')
        .select('date, completed, duration_mins')
        .eq('user_id', userId)
        .gte('date', prevWeekStart).lte('date', prevWeekEnd),

      supabase.from('sessions_logged')
        .select('date, duration_mins')
        .eq('user_id', userId)
        .eq('session_type', 'mindfulness')
        .gte('date', prevWeekStart).lte('date', prevWeekEnd),
    ])

    const sessions          = sessionsRes.data          || []
    const wellbeing         = wellbeingRes.data         || []
    const social            = socialRes.data            || []
    const mindfulness       = mindfulnessRes.data       || []
    const loggedMindfulness = loggedMindfulnessRes.data || []

    // ── Weekly raw scores (0–100) ──────────────────────────────────────────

    // Physical: frequency (4 sessions/week = full), duration, intensity
    const freqScore = Math.min(sessions.length / 4, 1) * 40
    const avgDur    = sessions.length
      ? sessions.reduce((s, r) => s + (r.duration_mins || 30), 0) / sessions.length : 0
    const durScore  = Math.min(avgDur / 60, 1) * 30
    const rpeSet    = sessions.filter(r => r.rpe)
    const avgRpe    = rpeSet.length
      ? rpeSet.reduce((s, r) => s + r.rpe, 0) / rpeSet.length : 5
    const rpeScore  = Math.min(avgRpe / 8, 1) * 30
    const weekPhysical = Math.round(freqScore + durScore + rpeScore)

    // Social: social activity logs + sessions done with others
    const socialEvents =
      social.filter(r => r.with_others !== false).length +
      sessions.filter(r => r.social_context === 'with_others').length
    const weekSocial = Math.min(Math.round(socialEvents * 25), 100)

    // Emotional: wellbeing logs (primary) + mindfulness bonuses
    const mindfulnessBonus       = Math.min(mindfulness.filter(r => r.completed).length * 8, 30)
    const loggedMindfulnessMins  = loggedMindfulness.reduce((s, r) => s + (r.duration_mins || 0), 0)
    const loggedMindfulnessBonus = Math.min(Math.round(loggedMindfulnessMins / 30 * 20), 20)
    const baseEmotional          = wellbeing.length
      ? Math.round(
          wellbeing.reduce((s, r) =>
            s + ((r.mood_score || 3) + (r.sleep_quality || 3) + (r.energy_score || 3)), 0
          ) / wellbeing.length / 3 / 5 * 70
        )
      : 0 // No wellbeing logs = no emotional contribution this week
    const weekEmotional = Math.min(baseEmotional + mindfulnessBonus + loggedMindfulnessBonus, 100)

    // ── Accumulate onto existing cumulative scores ─────────────────────────
    // Max per week per domain = 100 / WEEKS_TO_MATURE = 2.5 points
    const prevPhys = current?.physical_score  ?? 0
    const prevSoc  = current?.social_score    ?? 0
    const prevEmo  = current?.emotional_score ?? 0

    const physical_score  = Math.min(Math.round(prevPhys + weekPhysical  / WEEKS_TO_MATURE), 100)
    const social_score    = Math.min(Math.round(prevSoc  + weekSocial    / WEEKS_TO_MATURE), 100)
    const emotional_score = Math.min(Math.round(prevEmo  + weekEmotional / WEEKS_TO_MATURE), 100)

    // ── Balance index (0–100) ──────────────────────────────────────────────
    const avg      = (physical_score + social_score + emotional_score) / 3
    const variance = (
      Math.pow(physical_score  - avg, 2) +
      Math.pow(social_score    - avg, 2) +
      Math.pow(emotional_score - avg, 2)
    ) / 3
    const balance_index = Math.round(Math.max(0, 100 - Math.sqrt(variance)))

    // ── Growth stage ───────────────────────────────────────────────────────
    // Stage 1 (Acorn): locked until all three domains have ever contributed.
    // Sprouting requires physical, social, AND emotional each have > 0 cumulative score.
    //
    // Stages 2–7 calibrated for cumulative avg score:
    //   Stage 2  Seedling      avg  0–10   (1–4 weeks)
    //   Stage 3  Sapling       avg 10–25   (4–12 weeks)
    //   Stage 4  Young Oak     avg 25–42   (12–22 weeks)
    //   Stage 5  Established   avg 42–60   (22–32 weeks)
    //   Stage 6  Mature Oak    avg 60–76   (32–40 weeks consistent effort)
    //   Stage 7  Ancient Oak   avg 76+     (beyond 40 weeks of excellence)
    const allSprouted = physical_score > 0 && social_score > 0 && emotional_score > 0

    const growth_stage = !allSprouted ? 1 :
      avg < 10 ? 2 :
      avg < 25 ? 3 :
      avg < 42 ? 4 :
      avg < 60 ? 5 :
      avg < 76 ? 6 : 7

    await supabase.from('oak_tree_states').upsert(
      {
        user_id:        userId,
        growth_stage,
        physical_score,
        social_score,
        emotional_score,
        balance_index,
        last_updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    )
  } catch (err) {
    console.warn('Oak tree calculation failed silently:', err.message)
  }
}
