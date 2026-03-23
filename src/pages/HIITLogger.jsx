import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { SESSION_DOMAIN_MAP } from '../utils/activityDomains'

// ── Constants ───────────────────────────────────────────────────────────────
const WARMUP_SECS  = 10
const DEFAULT_WORK = 40   // seconds per interval

const getWorkDuration = (ex) => (ex?.reps >= 20 ? ex.reps : DEFAULT_WORK)
const getRestDuration  = (ex) => ex?.rest_secs ?? 30
const totalSets        = (ex) => Math.max(1, ex?.sets ?? 3)

const RPE_LABELS = ['', 'Very easy', 'Easy', 'Moderate', 'Somewhat hard', 'Hard',
                    'Hard+', 'Very hard', 'Very hard+', 'Near max', 'Max effort']
const rpeColor = (v) => v <= 3 ? 'bg-emerald-500' : v <= 5 ? 'bg-yellow-400' : v <= 7 ? 'bg-orange-400' : 'bg-red-500'

// ── Main component ───────────────────────────────────────────────────────────
export default function HIITLogger() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { session: authSession } = useAuth()
  const userId = authSession.user.id

  const [planSession, setPlanSession]         = useState(null)
  const [planExercises, setPlanExercises]     = useState([])
  const [exerciseDetails, setExerciseDetails] = useState({})
  const [loading, setLoading]                 = useState(true)

  // Phase machine: warmup | work | rpe | rest | done
  const [phase, setPhase]       = useState('warmup')
  const [exIdx, setExIdx]       = useState(0)
  const [setIdx, setSetIdx]     = useState(0)
  const [timeLeft, setTimeLeft] = useState(WARMUP_SECS)

  // RPE
  const [pendingRpe, setPendingRpe] = useState(6)
  const [rpeRatings, setRpeRatings] = useState([])   // [{exIdx, setIdx, rpe}]

  // Session timing
  const sessionStartRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)
  const tickRef = useRef(null)

  // Save/complete
  const [hr, setHr]         = useState('')
  const [saving, setSaving] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────────
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

      const map = {}
      const ids = [...new Set(exercises.map(e => e.exercise_id).filter(Boolean))]
      if (ids.length) {
        const { data: byId } = await supabase
          .from('exercises')
          .select('id, gif_url, description_start, description_move, description_avoid, muscles_primary')
          .in('id', ids)
        for (const d of byId ?? []) map[d.id] = d
      }
      // Fallback: name lookup for exercises where exercise_id is null
      const noIdNames = [...new Set(
        exercises.filter(e => !e.exercise_id).map(e => (e.exercise_name ?? '').toLowerCase().trim()).filter(Boolean)
      )]
      if (noIdNames.length) {
        const nameResults = await Promise.all(
          noIdNames.map(name =>
            supabase
              .from('exercises')
              .select('id, gif_url, description_start, description_move, description_avoid, muscles_primary, name')
              .ilike('name', name)
              .limit(1)
              .maybeSingle()
          )
        )
        for (const { data } of nameResults) {
          if (data) map[data.name.toLowerCase().trim()] = data
        }
      }
      setExerciseDetails(map)
      setLoading(false)
    }
    load()
  }, [sessionId, navigate])

  // ── Elapsed timer ────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000)),
      1000
    )
    return () => clearInterval(t)
  }, [])

  // ── Phase countdown ──────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || phase === 'rpe' || phase === 'done') return

    if (timeLeft <= 0) {
      if (phase === 'warmup') {
        setPhase('work')
        setTimeLeft(getWorkDuration(planExercises[0]))
      } else if (phase === 'work') {
        setPendingRpe(6)
        setPhase('rpe')
      } else if (phase === 'rest') {
        setPhase('work')
        setTimeLeft(getWorkDuration(planExercises[exIdx]))
      }
      return
    }

    tickRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000)
    return () => clearTimeout(tickRef.current)
  }, [loading, phase, timeLeft, planExercises, exIdx])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const confirmRpe = () => {
    setRpeRatings(prev => [...prev, { exIdx, setIdx, rpe: pendingRpe }])
    const ex    = planExercises[exIdx]
    const sets  = totalSets(ex)
    const nSet  = setIdx + 1 >= sets ? 0 : setIdx + 1
    const nEx   = setIdx + 1 >= sets ? exIdx + 1 : exIdx

    if (nEx >= planExercises.length) {
      setPhase('done')
    } else {
      setExIdx(nEx)
      setSetIdx(nSet)
      setPhase('rest')
      setTimeLeft(getRestDuration(ex))
    }
  }

  const skipRest = () => {
    clearTimeout(tickRef.current)
    setTimeLeft(0)
  }

  const startNow = () => {
    clearTimeout(tickRef.current)
    setPhase('work')
    setTimeLeft(getWorkDuration(planExercises[exIdx]))
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const finishSession = async () => {
    setSaving(true)
    try {
      const endTime   = new Date()
      const startTime = new Date(sessionStartRef.current)
      const durationMins = Math.round((endTime - startTime) / 60000)
      const avgRpe = rpeRatings.length
        ? Math.round(rpeRatings.reduce((s, r) => s + r.rpe, 0) / rpeRatings.length)
        : null

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
          rpe:                avgRpe,
          hr_avg:             hr ? parseInt(hr) : null,
        })
        .select('id')
        .single()

      if (logged) {
        const rows = []
        planExercises.forEach((ex, eIdx) => {
          for (let sIdx = 0; sIdx < totalSets(ex); sIdx++) {
            rows.push({
              session_logged_id: logged.id,
              exercise_id:       ex.exercise_id ?? null,
              exercise_name:     ex.exercise_name,
              set_number:        sIdx + 1,
              reps:              ex.reps ?? null,
              weight_kg:         null,
              rest_secs:         ex.rest_secs ?? 30,
            })
          }
        })
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
          durationMins,
          exerciseCount: planExercises.length,
          setsCount:     rpeRatings.length,
          setsLabel:     'intervals',
        },
      })
    } catch (e) {
      console.error('HIIT save error:', e)
    } finally {
      setSaving(false)
    }
  }

  // ── Format helpers ────────────────────────────────────────────────────────
  const fmtTimer   = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  const fmtElapsed = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Early returns ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-slate-900">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!planExercises.length) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-slate-900 px-6 text-center gap-4">
        <p className="text-slate-400 text-sm">This session has no exercises yet.</p>
        <p className="text-slate-500 text-xs">Ask Rex to add exercises to this session first.</p>
        <button onClick={() => navigate(-1)} className="text-teal-400 text-sm mt-2">← Go back</button>
      </div>
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const currentEx      = planExercises[exIdx]
  const getDetail = (ex) => ex
    ? (exerciseDetails[ex.exercise_id] ?? exerciseDetails[(ex.exercise_name ?? '').toLowerCase().trim()])
    : null
  const detail         = getDetail(currentEx)
  const totalIntervals = planExercises.reduce((s, ex) => s + totalSets(ex), 0)
  const completedCount = rpeRatings.length

  const phaseDuration =
    phase === 'work'   ? getWorkDuration(currentEx) :
    phase === 'rest'   ? getRestDuration(currentEx) :
    WARMUP_SECS
  const progress = Math.max(0, Math.min(100, ((phaseDuration - timeLeft) / phaseDuration) * 100))

  // ── DONE screen (summary + HR entry) ──────────────────────────────────────
  if (phase === 'done') {
    const avgRpe = rpeRatings.length
      ? (rpeRatings.reduce((s, r) => s + r.rpe, 0) / rpeRatings.length).toFixed(1)
      : null

    return (
      <div className="h-dvh flex flex-col bg-slate-900 text-white">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center overflow-y-auto">
          <div className="text-6xl mb-5">🔥</div>
          <h2 className="text-2xl font-bold mb-1">Session complete!</h2>
          <p className="text-slate-400 text-sm mb-1">{planSession.title}</p>
          <div className="flex gap-4 text-xs text-slate-500 mb-10">
            <span>{fmtElapsed(elapsed)} elapsed</span>
            <span>·</span>
            <span>{totalIntervals} intervals</span>
            {avgRpe && <><span>·</span><span>Avg RPE {avgRpe}</span></>}
          </div>

          {/* HR entry */}
          <div className="w-full max-w-xs mb-6">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">
              Average heart rate
            </label>
            <div className="flex items-center justify-center gap-3">
              <input
                type="number"
                inputMode="numeric"
                value={hr}
                onChange={e => setHr(e.target.value)}
                placeholder="—"
                className="w-28 bg-slate-800 border border-slate-700 rounded-2xl px-4 py-3 text-white text-center text-2xl font-bold placeholder:text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <span className="text-slate-500 text-sm">bpm</span>
            </div>
          </div>

          <button
            onClick={finishSession}
            disabled={saving}
            className="w-full max-w-xs bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-white py-4 rounded-2xl font-bold text-sm disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving…' : 'Save & finish'}
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 text-xs text-slate-600 underline"
          >
            Skip & exit without saving
          </button>
        </div>
      </div>
    )
  }

  // ── RPE screen ────────────────────────────────────────────────────────────
  if (phase === 'rpe') {
    const sets           = totalSets(currentEx)
    const isLastInterval = (setIdx + 1 >= sets) && (exIdx + 1 >= planExercises.length)

    return (
      <div className="h-dvh flex flex-col bg-slate-900 text-white">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-xs text-slate-600 tabular-nums">{fmtElapsed(elapsed)}</span>
          <span className="text-xs text-slate-500 font-medium">{completedCount + 1} / {totalIntervals}</span>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Rate that interval</p>
          <h2 className="text-xl font-bold text-white capitalize mb-1">{currentEx?.exercise_name}</h2>
          <p className="text-xs text-slate-600 mb-8">Set {setIdx + 1} of {sets}</p>

          {/* RPE circle */}
          <div className={`w-24 h-24 rounded-full ${rpeColor(pendingRpe)} flex items-center justify-center mb-3 transition-colors duration-200`}>
            <span className="text-4xl font-black text-white">{pendingRpe}</span>
          </div>
          <p className="text-sm text-slate-400 mb-8 min-h-[1.25rem]">{RPE_LABELS[pendingRpe]}</p>

          {/* Slider */}
          <div className="w-full max-w-xs">
            <input
              type="range"
              min={1}
              max={10}
              value={pendingRpe}
              onChange={e => setPendingRpe(parseInt(e.target.value))}
              className="w-full h-3 rounded-full cursor-pointer accent-teal-500"
            />
            <div className="flex justify-between mt-2">
              <span className="text-xs text-slate-600">1 · Easy</span>
              <span className="text-xs text-slate-600">10 · Max</span>
            </div>
          </div>

          <button
            onClick={confirmRpe}
            className="mt-10 w-full max-w-xs bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-white py-4 rounded-2xl font-bold text-sm transition-colors"
          >
            {isLastInterval ? 'Finish session →' : 'Next →'}
          </button>
        </div>
      </div>
    )
  }

  // ── REST screen ───────────────────────────────────────────────────────────
  if (phase === 'rest') {
    const nextEx     = planExercises[exIdx]
    const nextDetail = getDetail(nextEx)
    const descLines  = [nextDetail?.description_start, nextDetail?.description_move].filter(Boolean)

    return (
      <div className="h-dvh flex flex-col bg-slate-900 text-white overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <span className="text-xs text-slate-600 tabular-nums">{fmtElapsed(elapsed)}</span>
          <span className="text-xs text-slate-500">{completedCount}/{totalIntervals} done</span>
        </div>

        {/* REST badge + countdown */}
        <div className="flex flex-col items-center pt-2 pb-3 shrink-0">
          <span className="text-xs font-black text-slate-500 uppercase tracking-widest mb-1">Rest</span>
          <span className="text-7xl font-black tabular-nums text-slate-200 leading-none">
            {fmtTimer(timeLeft)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="shrink-0 mb-1">
          <div className="h-1 bg-slate-800 overflow-hidden">
            <div
              className="h-full bg-slate-600 transition-all duration-1000"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Next exercise preview */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <p className="text-xs font-black text-teal-500 uppercase tracking-widest text-center pt-3 pb-2">
            Next up
          </p>

          {nextDetail?.gif_url ? (
            <div className="w-full bg-slate-800 flex items-center justify-center" style={{ height: 200 }}>
              <img
                src={nextDetail.gif_url}
                alt={nextEx?.exercise_name}
                className="h-full w-full object-contain"
              />
            </div>
          ) : null}

          <div className="px-5 pt-4 pb-3 space-y-2">
            <h3 className="text-xl font-bold text-white capitalize">{nextEx?.exercise_name}</h3>
            {nextEx?.reps && nextEx.reps < 20 && (
              <p className="text-xs text-slate-500">Target: {nextEx.reps} reps</p>
            )}
            {descLines.map((d, i) => (
              <p key={i} className="text-sm text-slate-400 leading-snug">{d}</p>
            ))}
            {nextEx?.technique_cue && (
              <p className="text-xs text-teal-400 italic mt-2">"{nextEx.technique_cue}"</p>
            )}
          </div>
        </div>

        {/* Skip button */}
        <div className="px-5 pb-6 pt-3 shrink-0">
          <button
            onClick={skipRest}
            className="w-full border border-slate-700 text-slate-400 py-4 rounded-2xl font-semibold text-sm active:bg-slate-800 transition-colors"
          >
            Skip rest · Start now →
          </button>
        </div>
      </div>
    )
  }

  // ── WARMUP + WORK screen (hero timer) ─────────────────────────────────────
  const isWarmup  = phase === 'warmup'
  const barColour = isWarmup ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="h-dvh flex flex-col bg-slate-900 text-white overflow-hidden">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <button
          onClick={() => {
            if (window.confirm("Exit session? Progress won't be saved.")) navigate(-1)
          }}
          className="text-slate-600 text-sm"
        >✕</button>
        <span className="text-xs text-slate-500 tabular-nums">{fmtElapsed(elapsed)}</span>
        <span className="text-xs text-slate-500">{completedCount}/{totalIntervals}</span>
      </div>

      {/* Full-width progress bar */}
      <div className="shrink-0">
        <div className="h-1.5 bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${barColour} transition-all duration-1000`}
            style={{ width: `${isWarmup ? (1 - timeLeft / WARMUP_SECS) * 100 : progress}%` }}
          />
        </div>
      </div>

      {/* GIF — visible during both warmup and work */}
      {detail?.gif_url ? (
        <div
          className="w-full bg-slate-800 flex items-center justify-center shrink-0"
          style={{ height: 180 }}
        >
          <img
            key={detail.gif_url}
            src={detail.gif_url}
            alt={currentEx?.exercise_name}
            className="h-full w-full object-contain"
          />
        </div>
      ) : (
        <div className="shrink-0" style={{ height: 20 }} />
      )}

      {/* Phase label + exercise info */}
      <div className="px-5 pt-4 shrink-0">
        <p className={`text-xs font-black uppercase tracking-widest ${isWarmup ? 'text-amber-400' : 'text-red-400'}`}>
          {isWarmup ? 'Get ready' : 'Work'}
        </p>
        <h2 className="text-xl font-bold text-white capitalize mt-0.5 leading-tight">
          {currentEx?.exercise_name}
        </h2>
        {!isWarmup && (
          <p className="text-xs text-slate-500 mt-0.5">
            Set {setIdx + 1} of {totalSets(currentEx)}
            {currentEx?.reps && currentEx.reps < 20 ? ` · Target ${currentEx.reps} reps` : ''}
          </p>
        )}
      </div>

      {/* ── HERO TIMER ── */}
      <div className="flex-1 flex items-center justify-center">
        <span
          className="font-black tabular-nums text-white leading-none"
          style={{ fontSize: 'clamp(72px, 22vw, 108px)' }}
        >
          {fmtTimer(timeLeft)}
        </span>
      </div>

      {/* Bottom action */}
      <div className="px-5 pb-6 pt-2 shrink-0">
        {isWarmup ? (
          <button
            onClick={startNow}
            className="w-full bg-red-500 hover:bg-red-400 active:bg-red-600 text-white py-4 rounded-2xl font-bold text-sm transition-colors"
          >
            Start now →
          </button>
        ) : (
          <button
            onClick={() => { setPendingRpe(6); setPhase('rpe') }}
            className="w-full border border-slate-700 text-slate-500 py-4 rounded-2xl font-semibold text-sm active:bg-slate-800 transition-colors"
          >
            Done early
          </button>
        )}
      </div>
    </div>
  )
}
