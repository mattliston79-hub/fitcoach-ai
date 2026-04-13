import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const MOVEMENT_LABELS = ['', 'Very awkward', 'A bit uncertain', 'Mostly there', 'Felt smooth', 'Perfect']
const RESERVE_LABELS  = ['', 'Nothing left', 'Very little', 'A fair amount', 'Plenty left', 'Could have doubled it']

/**
 * FeedbackModal
 *
 * Soft-gate feedback card shown after the user logs their final set
 * of a main exercise. Saves scores to exercise_feedback and calls onComplete.
 * Never blocks the user — skip always available, failures are silent.
 *
 * Props:
 *   exerciseId       {string}        — UUID from alongside_exercises
 *   exerciseName     {string}
 *   sessionLoggedId  {string}        — UUID of the sessions_logged row
 *   programmeId      {string|null}
 *   plannedSessionId {string|null}   — UUID of the sessions_planned row
 *   sessionNumber    {number|null}
 *   prescriptionType {string|null}   — reps | hold_seconds | breath_cycles | duration_mins
 *                                      load_feel is suppressed for hold_seconds/breath_cycles
 *   onComplete       {function}      — called after save or skip
 */
export default function FeedbackModal({
  exerciseId,
  exerciseName,
  sessionLoggedId,
  programmeId,
  plannedSessionId,
  sessionNumber,
  prescriptionType,
  onComplete,
}) {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [movementQuality, setMovementQuality] = useState(null)
  const [exertionReserve, setExertionReserve] = useState(null)
  const [loadFeel, setLoadFeel]               = useState(null)
  const [saving, setSaving] = useState(false)

  const hideLoad   = prescriptionType === 'hold_seconds' || prescriptionType === 'breath_cycles'
  const allAnswered = movementQuality !== null && exertionReserve !== null && (hideLoad || loadFeel !== null)

  async function saveAndContinue() {
    setSaving(true)
    try {
      await supabase.from('exercise_feedback').insert({
        user_id:            userId,
        exercise_id:        exerciseId,
        session_logged_id:  sessionLoggedId,
        programme_id:       programmeId      ?? null,
        planned_session_id: plannedSessionId ?? null,
        session_number:     sessionNumber    ?? null,
        movement_quality:   movementQuality,
        exertion_reserve:   exertionReserve,
        load_feel:          hideLoad ? null : loadFeel,
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
        user_id:            userId,
        exercise_id:        exerciseId,
        session_logged_id:  sessionLoggedId,
        programme_id:       programmeId      ?? null,
        planned_session_id: plannedSessionId ?? null,
        session_number:     sessionNumber    ?? null,
        skipped:            true,
      })
    } catch (_) {
      // silent — never block the user
    }
    onComplete()
  }

  const ScaleRow = ({ value, onChange }) => (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={[
            'flex-1 py-2.5 rounded-xl text-xs font-bold transition-colors',
            value === n
              ? 'bg-teal-500 text-white'
              : 'bg-[#0f2540] text-slate-400 hover:bg-slate-700',
          ].join(' ')}
        >
          {n}
        </button>
      ))}
    </div>
  )

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

      <div className="flex flex-col gap-5">

        {/* Movement quality */}
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <p className="text-slate-200 text-xs font-medium">How natural did that movement feel?</p>
            {movementQuality !== null && (
              <p className="text-teal-400 text-xs shrink-0 ml-2">{MOVEMENT_LABELS[movementQuality]}</p>
            )}
          </div>
          <ScaleRow value={movementQuality} onChange={setMovementQuality} />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-slate-600">Awkward</span>
            <span className="text-xs text-slate-600">Perfect</span>
          </div>
        </div>

        {/* Exertion reserve */}
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <p className="text-slate-200 text-xs font-medium">How much left in the tank?</p>
            {exertionReserve !== null && (
              <p className="text-teal-400 text-xs shrink-0 ml-2">{RESERVE_LABELS[exertionReserve]}</p>
            )}
          </div>
          <ScaleRow value={exertionReserve} onChange={setExertionReserve} />
          <div className="flex justify-between mt-1">
            <span className="text-xs text-slate-600">Nothing left</span>
            <span className="text-xs text-slate-600">Plenty left</span>
          </div>
        </div>

        {/* Load feel — hidden for hold_seconds / breath_cycles */}
        {!hideLoad && (
          <div>
            <p className="text-slate-200 text-xs font-medium mb-2">How did the load feel?</p>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { value: 'too_light',   label: 'Too light'   },
                { value: 'about_right', label: 'About right' },
                { value: 'too_heavy',   label: 'Too heavy'   },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setLoadFeel(value)}
                  className={[
                    'rounded-xl px-2 py-2.5 text-xs font-medium transition-colors',
                    loadFeel === value
                      ? 'bg-teal-500 text-white'
                      : 'bg-[#0f2540] text-slate-300 hover:bg-slate-700',
                  ].join(' ')}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

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
