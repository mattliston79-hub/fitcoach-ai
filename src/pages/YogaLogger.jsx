import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { SESSION_DOMAIN_MAP } from '../utils/activityDomains'

// ── Theme per session type ───────────────────────────────────────────────────
const THEMES = {
  yoga: {
    spinner:      'border-violet-500',
    badge:        'bg-violet-100 text-violet-700',
    muscles:      'bg-violet-50 text-violet-600',
    bar:          'bg-violet-400',
    numberActive: 'bg-violet-500',
    accent:       'text-violet-600',
    cue:          'text-violet-500',
    finish:       'bg-violet-600 hover:bg-violet-700',
    icon:         '🧘',
  },
  pilates: {
    spinner:      'border-pink-500',
    badge:        'bg-pink-100 text-pink-700',
    muscles:      'bg-pink-50 text-pink-600',
    bar:          'bg-pink-400',
    numberActive: 'bg-pink-500',
    accent:       'text-pink-600',
    cue:          'text-pink-500',
    finish:       'bg-pink-600 hover:bg-pink-700',
    icon:         '🩰',
  },
  flexibility: {
    spinner:      'border-emerald-500',
    badge:        'bg-emerald-100 text-emerald-700',
    muscles:      'bg-emerald-50 text-emerald-600',
    bar:          'bg-emerald-400',
    numberActive: 'bg-emerald-500',
    accent:       'text-emerald-600',
    cue:          'text-emerald-500',
    finish:       'bg-emerald-600 hover:bg-emerald-700',
    icon:         '🌿',
  },
}
const DEFAULT_THEME = THEMES.yoga

// ── Main component ───────────────────────────────────────────────────────────
export default function YogaLogger() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { session: authSession } = useAuth()
  const userId = authSession.user.id

  const [planSession, setPlanSession]         = useState(null)
  const [planExercises, setPlanExercises]     = useState([])
  const [exerciseDetails, setExerciseDetails] = useState({})
  const [loading, setLoading]                 = useState(true)

  const [completed, setCompleted] = useState(new Set())   // Set of completed indices
  const cardRefs = useRef([])

  // Duration timer — counts UP
  const sessionStartRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  const [saving, setSaving] = useState(false)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('sessions_planned')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (error || !data) { navigate(-1); return }

      setPlanSession(data)
      const exercises = data.exercises_json ?? []
      setPlanExercises(exercises)

      const ids = [...new Set(exercises.map(e => e.exercise_id).filter(Boolean))]
      if (ids.length) {
        const { data: details } = await supabase
          .from('exercises')
          .select('id, gif_url, description_start, description_move, description_avoid, muscles_primary')
          .in('id', ids)
        if (details) {
          const map = {}; details.forEach(d => { map[d.id] = d })
          setExerciseDetails(map)
        }
      }
      setLoading(false)
    }
    load()
  }, [sessionId, navigate])

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000)),
      1000
    )
    return () => clearInterval(t)
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const completePose = (idx) => {
    setCompleted(prev => {
      const next = new Set(prev)
      next.add(idx)
      // Scroll next incomplete pose into view
      const nextIdx = planExercises.findIndex((_, i) => i > idx && !next.has(i))
      if (nextIdx >= 0) {
        setTimeout(() => {
          cardRefs.current[nextIdx]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 200)
      }
      return next
    })
  }

  const finishSession = async () => {
    setSaving(true)
    try {
      const endTime      = new Date()
      const startTime    = new Date(sessionStartRef.current)
      const durationMins = Math.round((endTime - startTime) / 60000)

      const { data: logged } = await supabase
        .from('sessions_logged')
        .insert({
          user_id:            userId,
          planned_session_id: sessionId,
          date:               planSession.date,
          session_type:       planSession.session_type,
          start_time:         startTime.toISOString(),
          end_time:           endTime.toISOString(),
          duration_mins:      durationMins,
        })
        .select('id')
        .single()

      if (logged) {
        const rows = planExercises.map((ex) => ({
          session_logged_id: logged.id,
          exercise_id:       ex.exercise_id ?? null,
          exercise_name:     ex.exercise_name,
          set_number:        1,
          reps:              ex.reps ?? null,
          weight_kg:         null,
          rest_secs:         ex.rest_secs ?? null,
        }))
        if (rows.length) await supabase.from('exercise_sets').insert(rows)
      }

      await supabase
        .from('sessions_planned')
        .update({ status: 'complete' })
        .eq('id', sessionId)

      // ── Side effects: activity log + oak tree nudge ────────────────────────
      try {
        const mapping = SESSION_DOMAIN_MAP[planSession.session_type] ?? { domain: 'physical', secondaryDomain: null }
        const { error: alErr } = await supabase.from('activity_log').insert({
          user_id:          userId,
          title:            planSession.title ?? planSession.session_type.replace(/_/g, ' '),
          domain:           mapping.domain,
          secondary_domain: mapping.secondaryDomain,
          activity_type:    'planned_session',
          activity_subtype: planSession.session_type,
          source_id:        planSession.id,
          goal_id:          planSession.goal_id ?? null,
          duration_mins:    durationMins,
          logged_at:        new Date().toISOString(),
        })
        if (alErr) console.error('activity_log insert error:', alErr)
        const { error: n1Err } = await supabase.rpc('nudge_tree_score', { p_user_id: userId, p_domain: mapping.domain, p_delta: 5 })
        if (n1Err) console.error('nudge_tree_score error:', n1Err)
        if (mapping.secondaryDomain) {
          const { error: n2Err } = await supabase.rpc('nudge_tree_score', { p_user_id: userId, p_domain: mapping.secondaryDomain, p_delta: 3 })
          if (n2Err) console.error('nudge_tree_score (secondary) error:', n2Err)
        }
      } catch (sideEffectErr) {
        console.error('Session side-effects error:', sideEffectErr)
      }

      navigate(`/post-session/${logged?.id ?? 'unknown'}`, {
        state: {
          title:         planSession.title || 'Session',
          sessionType:   planSession.session_type,
          durationMins:  Math.round((new Date() - new Date(sessionStartRef.current)) / 60000),
          exerciseCount: planExercises.length,
          setsCount:     completed.size,
          setsLabel:     'poses',
        },
      })
    } catch (e) {
      console.error('Yoga save error:', e)
    } finally {
      setSaving(false)
    }
  }

  const fmtElapsed = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Loading / empty ───────────────────────────────────────────────────────
  if (loading) {
    const spinnerColour = THEMES[null]?.spinner ?? 'border-violet-500'
    return (
      <div className="h-dvh flex items-center justify-center bg-[#FAFAF7]">
        <div className={`w-8 h-8 border-4 border-t-transparent rounded-full animate-spin ${spinnerColour}`} />
      </div>
    )
  }

  if (!planExercises.length) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#FAFAF7] px-6 text-center gap-4">
        <p className="text-slate-500 text-sm">This session has no poses yet.</p>
        <p className="text-slate-400 text-xs">Ask Rex to add exercises, then try again.</p>
        <button onClick={() => navigate(-1)} className="text-violet-600 text-sm mt-2">← Go back</button>
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const theme          = THEMES[planSession?.session_type] ?? DEFAULT_THEME
  const completedCount = completed.size
  const totalCount     = planExercises.length
  const allDone        = completedCount === totalCount
  const progressPct    = totalCount ? (completedCount / totalCount) * 100 : 0

  // Focus areas from muscles across all exercises
  const focusAreas = [...new Set(
    planExercises.flatMap(ex => exerciseDetails[ex.exercise_id]?.muscles_primary ?? [])
  )].slice(0, 3)

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="h-dvh flex flex-col bg-[#FAFAF7] overflow-hidden">

      {/* ── Sticky header ── */}
      <div className="bg-white border-b border-slate-100 px-4 pt-3 pb-3 shrink-0">
        {/* Title row */}
        <div className="flex items-center gap-2 mb-2.5">
          <button
            onClick={() => {
              if (window.confirm("Exit session? Progress won't be saved.")) navigate(-1)
            }}
            className="text-slate-400 text-sm shrink-0"
          >✕</button>
          <p className="text-sm font-bold text-slate-800 flex-1 truncate">{planSession.title}</p>
          <span className="text-sm font-bold text-slate-400 tabular-nums shrink-0">
            {fmtElapsed(elapsed)}
          </span>
        </div>

        {/* Tags row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1.5 min-w-0">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize shrink-0 ${theme.badge}`}>
              {planSession.session_type?.replace(/_/g, ' ')}
            </span>
            {focusAreas.map(a => (
              <span key={a} className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded-full capitalize">
                {a}
              </span>
            ))}
          </div>
          <span className="text-xs font-bold text-slate-400 shrink-0">
            {completedCount}/{totalCount}
          </span>
        </div>

        {/* Progress bar */}
        <div className="mt-2.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${theme.bar} rounded-full transition-all duration-500`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* ── Scrollable pose sequence ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-4 pb-6 space-y-5">
        {planExercises.map((ex, idx) => {
          const detail  = exerciseDetails[ex.exercise_id]
          const isDone  = completed.has(idx)

          // Hold/duration display
          const holdLabel = ex.rest_secs ? `Hold: ${ex.rest_secs}s`
            : ex.reps && ex.reps >= 20   ? `${ex.reps}s`
            : ex.reps                    ? `${ex.reps} breaths`
            : null

          // Description lines with labels
          const descLines = [
            detail?.description_start && {
              label: 'Position',
              text:  detail.description_start,
              colour: theme.accent,
            },
            detail?.description_move && {
              label: 'Movement',
              text:  detail.description_move,
              colour: 'text-slate-500',
            },
            detail?.description_avoid && {
              label: 'Watch',
              text:  detail.description_avoid,
              colour: 'text-amber-600',
            },
          ].filter(Boolean)

          return (
            <div
              key={idx}
              ref={el => { cardRefs.current[idx] = el }}
              className={`bg-white rounded-2xl overflow-hidden border transition-all duration-300 ${
                isDone ? 'border-teal-200 opacity-55' : 'border-slate-200 shadow-sm'
              }`}
            >
              {/* ── Pose header ── */}
              <div className={`flex items-center justify-between px-4 py-3 border-b ${
                isDone ? 'border-teal-100 bg-teal-50/60' : 'border-slate-100 bg-slate-50/80'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black text-white shrink-0 transition-colors ${
                    isDone ? 'bg-teal-500' : theme.numberActive
                  }`}>
                    {isDone ? '✓' : idx + 1}
                  </span>
                  <h3 className="text-sm font-bold text-slate-800 capitalize truncate">
                    {ex.exercise_name}
                  </h3>
                </div>
                {holdLabel && (
                  <span className={`text-xs font-semibold shrink-0 ml-2 ${theme.accent}`}>
                    {holdLabel}
                  </span>
                )}
              </div>

              {/* ── GIF ── */}
              {detail?.gif_url && (
                <div
                  className="w-full bg-slate-900 flex items-center justify-center"
                  style={{ height: 210 }}
                >
                  <img
                    src={detail.gif_url}
                    alt={ex.exercise_name}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}

              {/* ── Description lines ── */}
              {descLines.length > 0 && (
                <div className="px-4 pt-4 pb-2 space-y-3">
                  {descLines.map(({ label, text, colour }, i) => (
                    <div key={i} className="flex gap-3">
                      <span className={`text-xs font-bold w-16 shrink-0 mt-0.5 ${colour}`}>
                        {label}
                      </span>
                      <p className="text-sm text-slate-600 leading-snug">{text}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ── Technique cue ── */}
              {ex.technique_cue && (
                <div className="px-4 pb-2 pt-1">
                  <p className={`text-sm italic leading-snug ${theme.cue}`}>
                    "{ex.technique_cue}"
                  </p>
                </div>
              )}

              {/* ── Muscle chips ── */}
              {detail?.muscles_primary?.length > 0 && (
                <div className="px-4 pb-3 pt-1 flex flex-wrap gap-1.5">
                  {detail.muscles_primary.map(m => (
                    <span
                      key={m}
                      className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${theme.muscles}`}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}

              {/* ── Complete button ── */}
              {!isDone && (
                <div className="px-4 pb-4 pt-1">
                  <button
                    onClick={() => completePose(idx)}
                    className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white py-3.5 rounded-xl font-bold text-sm transition-colors"
                  >
                    ✓  Pose complete
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Sticky finish bar ── */}
      <div className="bg-white border-t border-slate-100 px-4 pt-3 pb-5 shrink-0">
        <button
          onClick={finishSession}
          disabled={saving}
          className={`w-full py-4 rounded-2xl font-bold text-sm transition-colors disabled:opacity-50 ${
            allDone
              ? `${theme.finish} text-white shadow-sm`
              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
          }`}
        >
          {saving
            ? 'Saving…'
            : allDone
              ? `${theme.icon}  Finish Session`
              : `Finish early · ${completedCount}/${totalCount} complete`}
        </button>
      </div>
    </div>
  )
}
