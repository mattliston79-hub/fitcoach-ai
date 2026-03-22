import { supabase } from '../lib/supabase'

/**
 * Reads the last 14 days of activity across all three domains,
 * calculates scores, and upserts the result into oak_tree_states.
 * Call fire-and-forget after any session, wellbeing log, social log,
 * or mindfulness log is saved.
 */
export async function calculateOakTreeState(userId) {
  if (!userId) return

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)
  const since = cutoff.toISOString().slice(0, 10)

  try {
    const [sessionsRes, wellbeingRes, socialRes, mindfulnessRes, loggedMindfulnessRes] = await Promise.all([
      supabase.from('sessions_logged')
        .select('date, duration_mins, rpe, social_context')
        .eq('user_id', userId).gte('date', since),
      supabase.from('wellbeing_logs')
        .select('mood_score, energy_score, sleep_quality')
        .eq('user_id', userId).gte('date', since),
      supabase.from('social_activity_logs')
        .select('date, with_others')
        .eq('user_id', userId).gte('date', since),
      supabase.from('mindfulness_logs')
        .select('date, completed, duration_mins')
        .eq('user_id', userId).gte('date', since),
      // Supplementary: mindfulness sessions logged via MindfulnessLogger
      supabase.from('sessions_logged')
        .select('date, duration_mins')
        .eq('user_id', userId)
        .eq('session_type', 'mindfulness')
        .gte('date', since),
    ])

    const sessions             = sessionsRes.data           || []
    const wellbeing            = wellbeingRes.data          || []
    const social               = socialRes.data             || []
    const mindfulness          = mindfulnessRes.data        || []
    const loggedMindfulness    = loggedMindfulnessRes.data  || []

    // Physical score (0–100)
    const freqScore = Math.min(sessions.length / 6, 1) * 40
    const avgDur    = sessions.length
      ? sessions.reduce((s,r) => s + (r.duration_mins || 30), 0) / sessions.length : 0
    const durScore  = Math.min(avgDur / 60, 1) * 30
    const rpeSet    = sessions.filter(r => r.rpe)
    const avgRpe    = rpeSet.length
      ? rpeSet.reduce((s,r) => s + r.rpe, 0) / rpeSet.length : 5
    const rpeScore  = Math.min(avgRpe / 8, 1) * 30
    const physical_score = Math.round(freqScore + durScore + rpeScore)

    // Social score (0–100)
    const socialEvents =
      social.filter(r => r.with_others !== false).length +
      sessions.filter(r => r.social_context === 'with_others').length
    const social_score = Math.min(Math.round(socialEvents * 20), 100)

    // Emotional score (0–100)
    // Combines wellbeing logs, mindfulness_logs bonus, and sessions_logged mindfulness bonus
    const mindfulnessBonus = Math.min(mindfulness.filter(r => r.completed).length * 8, 30)
    const loggedMindfulnessMinutes = loggedMindfulness.reduce((s, r) => s + (r.duration_mins || 0), 0)
    // 30 mins of logged sessions = full +20 pt bonus, scales linearly below
    const loggedMindfulnessBonus = Math.min(Math.round(loggedMindfulnessMinutes / 30 * 20), 20)
    const baseEmotional = wellbeing.length
      ? Math.round(
          wellbeing.reduce((s,r) =>
            s + ((r.mood_score || 3) + (r.sleep_quality || 3) + (r.energy_score || 3)), 0
          ) / wellbeing.length / 3 / 5 * 70
        )
      : 28 // neutral default (70% of 40 neutral)
    const emotional_score = Math.min(baseEmotional + mindfulnessBonus + loggedMindfulnessBonus, 100)

    // Balance index (0–100): 100 = perfectly balanced across all three domains
    const avg = (physical_score + social_score + emotional_score) / 3
    const variance =
      (Math.pow(physical_score - avg, 2) +
       Math.pow(social_score    - avg, 2) +
       Math.pow(emotional_score - avg, 2)) / 3
    const balance_index = Math.round(Math.max(0, 100 - Math.sqrt(variance)))

    // Growth stage (1–7): weighted 60% average score, 40% balance
    const combined = avg * 0.6 + balance_index * 0.4
    const growth_stage =
      combined < 10 ? 1 :
      combined < 25 ? 2 :
      combined < 40 ? 3 :
      combined < 55 ? 4 :
      combined < 70 ? 5 :
      combined < 85 ? 6 : 7

    await supabase.from('oak_tree_states').upsert(
      { user_id: userId, growth_stage, physical_score, social_score,
        emotional_score, balance_index, last_updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    )
  } catch (err) {
    console.warn('Oak tree calculation failed silently:', err.message)
  }
}
