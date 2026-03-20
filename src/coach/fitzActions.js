import { supabase } from '../lib/supabase'
import { MINDFULNESS_PRACTICES } from './mindfulnessKnowledge.js'

/**
 * Inserts a mindfulness session into sessions_planned on behalf of Fitz.
 * Never throws — returns { success, sessionId } or { success, error }.
 *
 * @param {{ userId: string, date: string, practiceKey: string, durationMins: number, purposeNote: string, goalId?: string }} params
 */
export async function addMindfulnessSession({ userId, date, practiceKey, durationMins, purposeNote, goalId = null }) {
  const practice = MINDFULNESS_PRACTICES[practiceKey]
  const title = practice?.name ?? 'Mindfulness'

  const { data, error } = await supabase
    .from('sessions_planned')
    .insert({
      user_id:        userId,
      date,
      session_type:   'mindfulness',
      practice_type:  practiceKey,
      duration_mins:  durationMins,
      title,
      purpose_note:   purposeNote,
      goal_id:        goalId,
      exercises_json: [],
      status:         'planned',
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, sessionId: data.id }
}
