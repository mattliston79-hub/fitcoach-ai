import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const QUESTIONS = [
  {
    key:     'coordination_score',
    label:   'How natural did that movement feel?',
    options: ['Very awkward', 'A bit uncertain', 'Mostly controlled', 'Felt natural'],
  },
  {
    key:     'reserve_score',
    label:   'How much did you have left in the tank after the final rep?',
    options: ['Nothing left', 'A little', 'A fair amount', 'Could have done more'],
  },
  {
    key:     'load_score',
    label:   'How did the weight feel today?',
    options: ['Too heavy', 'Challenging', 'About right', 'Too easy'],
  },
]

/**
 * ExerciseFeedbackCard
 *
 * Soft-gate feedback card shown after the user logs their final set
 * of an exercise. Saves scores to exercise_feedback and calls onComplete.
 * Never blocks the user — skip always available, failures are silent.
 *
 * Props:
 *   exerciseId      {string}   — UUID from alongside_exercises
 *   exerciseName    {string}
 *   sessionLoggedId {string}   — UUID of the session_logged row
 *   onComplete      {function} — called after save or skip
 */
export default function ExerciseFeedbackCard({ exerciseId, exerciseName, sessionLoggedId, onComplete }) {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [scores, setScores] = useState({ coordination_score: null, reserve_score: null, load_score: null })
  const [saving, setSaving] = useState(false)

  const allAnswered = scores.coordination_score !== null &&
                      scores.reserve_score      !== null &&
                      scores.load_score         !== null

  async function saveAndContinue() {
    setSaving(true)
    try {
      await supabase.from('exercise_feedback').insert({
        user_id:            userId,
        exercise_id:        exerciseId,
        session_logged_id:  sessionLoggedId,
        coordination_score: scores.coordination_score,
        reserve_score:      scores.reserve_score,
        load_score:         scores.load_score,
        skipped:            false,
      })
    } catch (_) {
      // silent — never block the user
    }
    setSaving(false)
    onComplete()
  }

  async function skipFeedback() {
    try {
      await supabase.from('exercise_feedback').insert({
        user_id:           userId,
        exercise_id:       exerciseId,
        session_logged_id: sessionLoggedId,
        skipped:           true,
      })
    } catch (_) {
      // silent — never block the user
    }
    onComplete()
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#1A3A5C] px-5 py-5 shadow-lg">

      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-[#0f2540] flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">R</span>
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">Tell Rex how that went</p>
          <p className="text-slate-400 text-xs mt-0.5">{exerciseName}</p>
        </div>
      </div>

      {/* Questions */}
      <div className="flex flex-col gap-5">
        {QUESTIONS.map(({ key, label, options }) => (
          <div key={key}>
            <p className="text-slate-200 text-xs font-medium mb-2">{label}</p>
            <div className="grid grid-cols-2 gap-1.5">
              {options.map((optionLabel, idx) => {
                const selected = scores[key] === idx
                return (
                  <button
                    key={idx}
                    onClick={() => setScores(prev => ({ ...prev, [key]: idx }))}
                    className={[
                      'rounded-xl px-3 py-2 text-xs font-medium text-left transition-colors',
                      selected
                        ? 'bg-teal-500 text-white'
                        : 'bg-[#0f2540] text-slate-300 hover:bg-slate-700',
                    ].join(' ')}
                  >
                    <span className="text-slate-400 mr-1">{idx}</span> {optionLabel}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-5 flex flex-col gap-2">
        <button
          onClick={saveAndContinue}
          disabled={!allAnswered || saving}
          className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          {saving ? 'Saving…' : 'Save and continue'}
        </button>
        <button
          onClick={skipFeedback}
          disabled={saving}
          className="w-full text-slate-400 text-xs py-1.5 hover:text-slate-300 transition-colors"
        >
          Skip for now
        </button>
      </div>
    </div>
  )
}
