import { supabase } from './supabase'

/**
 * Epley 1-rep max estimate.
 * Returns the weight itself when reps === 1 (no extrapolation needed).
 */
const epley = (weight, reps) =>
  reps === 1 ? weight : weight * (1 + reps / 30)

/**
 * For each completed set with weight > 0, compare estimated 1RM against the
 * user's stored PR for that exercise. Upserts any beaten records and returns
 * a description of every PR that was broken this session.
 *
 * @param {string} userId
 * @param {string} sessionLoggedId
 * @param {Array<{exercise_id, exercise_name, reps, weight_kg}>} completedSets
 * @returns {Promise<Array<{exercise_name, weight_kg, reps, one_rep_max_kg, previous_orm}>>}
 */
export async function checkAndSavePersonalRecords(userId, sessionLoggedId, completedSets) {
  // Only weighted sets with real reps count
  const valid = completedSets.filter(
    s => s.exercise_id && s.weight_kg > 0 && s.reps > 0
  )
  if (!valid.length) return []

  // Best estimated 1RM per exercise across all sets this session
  const bestByExercise = {}
  for (const s of valid) {
    const orm = epley(s.weight_kg, s.reps)
    if (!bestByExercise[s.exercise_id] || orm > bestByExercise[s.exercise_id].orm) {
      bestByExercise[s.exercise_id] = { ...s, orm }
    }
  }

  const exerciseIds = Object.keys(bestByExercise)

  // Fetch stored PRs for these exercises
  const { data: existing } = await supabase
    .from('personal_records')
    .select('exercise_id, one_rep_max_kg')
    .eq('user_id', userId)
    .in('exercise_id', exerciseIds)

  const existingMap = {}
  for (const r of existing ?? []) existingMap[r.exercise_id] = r.one_rep_max_kg

  const today   = new Date().toISOString().slice(0, 10)
  const beaten  = []
  const upserts = []

  for (const [exerciseId, best] of Object.entries(bestByExercise)) {
    const prevOrm  = existingMap[exerciseId] ?? 0
    const roundOrm = Math.round(best.orm * 10) / 10

    if (roundOrm > prevOrm) {
      beaten.push({
        exercise_name:  best.exercise_name,
        weight_kg:      best.weight_kg,
        reps:           best.reps,
        one_rep_max_kg: roundOrm,
        previous_orm:   prevOrm > 0 ? Math.round(prevOrm * 10) / 10 : null,
      })
      upserts.push({
        user_id:           userId,
        exercise_id:       exerciseId,
        exercise_name:     best.exercise_name,
        weight_kg:         best.weight_kg,
        reps:              best.reps,
        one_rep_max_kg:    roundOrm,
        date:              today,
        session_logged_id: sessionLoggedId,
      })
    }
  }

  if (upserts.length) {
    const { error } = await supabase
      .from('personal_records')
      .upsert(upserts, { onConflict: 'user_id,exercise_id' })
    if (error) {
      console.error('PR upsert error:', error)
      return []
    }
  }

  return beaten
}
