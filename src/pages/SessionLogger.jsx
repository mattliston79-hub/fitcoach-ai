import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { checkAndSavePersonalRecords } from '../lib/checkPersonalRecords'
import { SESSION_DOMAIN_MAP } from '../utils/activityDomains'
import ExerciseFeedbackCard from '../components/ExerciseFeedbackCard'

const STOP_WORDS = new Set(['and','with','the','a','an','or','for','of','in','on','at','to','by','from'])
function nameToPattern(rawName) {
  const words = rawName
    .replace(/\([^)]*\)/g, '')
    .toLowerCase()
    .split(/[\s,/\-]+/)
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 3)
  return words.length ? '%' + words.join('%') + '%' : '%' + rawName.toLowerCase().trim() + '%'
}

// ── Main component ──────────────────────────────────────────────────────────
export default function SessionLogger() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const { session: authSession } = useAuth()
  const userId = authSession.user.id

  const [planSession, setPlanSession]     = useState(null)
  const [planExercises, setPlanExercises] = useState([])
  const [exerciseDetails, setExerciseDetails] = useState({}) // exercise_id → row
  const [loading, setLoading]             = useState(true)

  // Sets state: keyed by exercise index (string) to handle duplicate exercise_ids
  const [allSets, setAllSets] = useState({})

  // Rest timer
  const [restSeconds, setRestSeconds] = useState(null)
  const restTimerRef = useRef(null)

  // Navigation
  const [currentIdx, setCurrentIdx] = useState(0)
  const [showViewAll, setShowViewAll] = useState(false)

  // Session timing
  const sessionStartRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // Save state
  const [saving, setSaving] = useState(false)

  // Exercise feedback card
  const [showFeedback, setShowFeedback]       = useState(false)
  const [feedbackExercise, setFeedbackExercise] = useState(null)
  // Holds feedback info to show once the rest timer ends
  const pendingFeedbackAfterRestRef = useRef(null)

  // ── Load planned session ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('sessions_planned')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (error || !data) { navigate(-1); return }

      // Defensive redirect — mindfulness sessions have their own logger
      if (data.session_type === 'mindfulness') {
        navigate(`/mindfulness/${sessionId}`, { replace: true })
        return
      }

      setPlanSession(data)
      const exercises = data.exercises_json ?? []
      setPlanExercises(exercises)

      // Initialise set rows per exercise (keyed by array index)
      const initSets = {}
      exercises.forEach((ex, idx) => {
        initSets[String(idx)] = Array.from(
          { length: Math.max(1, ex.sets ?? 3) },
          (_, i) => ({
            setNum:       i + 1,
            targetReps:   ex.reps     ?? '',
            targetWeight: ex.weight_kg ?? '',
            reps:   String(ex.reps     ?? ''),
            weight: ex.weight_kg != null ? String(ex.weight_kg) : '',
            completed: false,
          })
        )
      })
      setAllSets(initSets)

      // ── Fetch exercise details ──────────────────────────────
      const map = {}
      const ids = [...new Set(exercises.map(e => e.exercise_id).filter(Boolean))]

      if (ids.length) {
        // Step 1 — try alongside_exercises (programme-built sessions)
        const { data: alData } = await supabase
          .from('alongside_exercises')
          .select('id, gif_search_name, technique_start, technique_move, technique_avoid')
          .in('id', ids)

        const alFoundIds = new Set()
        const gifLookups = []

        for (const d of alData ?? []) {
          alFoundIds.add(d.id)
          map[d.id] = {
            gif_url:           null,
            description_start: d.technique_start ?? null,
            description_move:  d.technique_move  ?? null,
            description_avoid: d.technique_avoid ?? null,
            muscles_primary:   [],
          }
          if (d.gif_search_name) {
            gifLookups.push({ id: d.id, search: d.gif_search_name })
          }
        }

        // Step 2 — resolve gif_url via gif_search_name → exercises.gif_url
        if (gifLookups.length) {
          await Promise.all(gifLookups.map(async ({ id, search }) => {
            const { data: match } = await supabase
              .from('exercises')
              .select('gif_url')
              .ilike('name', `%${search}%`)
              .limit(1)
              .maybeSingle()
            if (match?.gif_url) {
              map[id].gif_url = match.gif_url
            }
          }))
        }

        // Step 3 — for IDs not in alongside_exercises, try legacy table
        const missingIds = ids.filter(id => !alFoundIds.has(id))
        if (missingIds.length) {
          const { data: legacyData } = await supabase
            .from('exercises')
            .select('id, gif_url, description_start, description_move, description_avoid, muscles_primary')
            .in('id', missingIds)
          for (const d of legacyData ?? []) map[d.id] = d
        }
      }
      // Fallback: keyword-pattern lookup for exercises where exercise_id is null
      const seen = new Set()
      const toFetch = exercises.filter(e => {
        if (e.exercise_id) return false
        const key = (e.exercise_name ?? e.name ?? '').toLowerCase().trim()
        if (!key || seen.has(key)) return false
        seen.add(key); return true
      })
      if (toFetch.length) {
        const nameResults = await Promise.all(
          toFetch.map(async ex => {
            const rawName = (ex.exercise_name ?? ex.name ?? '').trim()
            const { data } = await supabase
              .from('exercises')
              .select('id, gif_url, description_start, description_move, description_avoid, muscles_primary, name')
              .ilike('name', nameToPattern(rawName))
              .limit(1)
              .maybeSingle()
            return { key: rawName.toLowerCase().trim(), data }
          })
        )
        for (const { key, data } of nameResults) {
          if (data) map[key] = data
        }
      }
      setExerciseDetails(map)

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

  // ── Rest countdown ────────────────────────────────────────────────────────
  useEffect(() => {
    if (restSeconds === null) return
    if (restSeconds <= 0) {
      setRestSeconds(null)
      // Show feedback card if the final set of an exercise just completed
      if (pendingFeedbackAfterRestRef.current) {
        setFeedbackExercise(pendingFeedbackAfterRestRef.current)
        setShowFeedback(true)
        pendingFeedbackAfterRestRef.current = null
      }
      return
    }
    restTimerRef.current = setTimeout(() => setRestSeconds(s => s - 1), 1000)
    return () => clearTimeout(restTimerRef.current)
  }, [restSeconds])

  // ── Derived values ────────────────────────────────────────────────────────
  const currentKey    = String(currentIdx)
  const currentExPlan = planExercises[currentIdx]
  const currentSets   = allSets[currentKey] ?? []
  const getDetail = (ex) => ex
    ? (exerciseDetails[ex.exercise_id] ?? exerciseDetails[(ex.exercise_name ?? ex.name ?? '').toLowerCase().trim()])
    : null
  const detail        = getDetail(currentExPlan)
  const hasGif        = !!detail?.gif_url

  // Descriptions — only show lines that exist
  const descriptions = [
    detail?.description_start,
    detail?.description_move,
    detail?.description_avoid,
  ].filter(Boolean)

  const isExDone = useCallback(
    (key) => { const s = allSets[key] ?? []; return s.length > 0 && s.every(x => x.completed) },
    [allSets]
  )
  const allDone        = planExercises.every((_, idx) => isExDone(String(idx)))
  const completedExCount = planExercises.filter((_, idx) => isExDone(String(idx))).length

  // ── Handlers ──────────────────────────────────────────────────────────────
  const completeSet = useCallback((key, setIdx) => {
    setAllSets(prev => {
      const sets = [...(prev[key] ?? [])]
      sets[setIdx] = { ...sets[setIdx], completed: true }
      return { ...prev, [key]: sets }
    })

    const ex       = planExercises[parseInt(key)]
    const restSecs = ex?.rest_secs ?? 90
    const totalSets = allSets[key]?.length ?? (ex?.sets ?? 3)
    const isLastSet = setIdx === totalSets - 1

    // Queue feedback card for main exercises (those with an exercise_id) when
    // the final set is completed. Show after rest, or immediately if no rest.
    if (isLastSet && ex?.exercise_id) {
      const feedbackInfo = {
        exerciseId:   ex.exercise_id,
        exerciseName: ex.exercise_name ?? ex.name ?? 'Exercise',
      }
      if (restSecs > 0) {
        pendingFeedbackAfterRestRef.current = feedbackInfo
      } else {
        setFeedbackExercise(feedbackInfo)
        setShowFeedback(true)
      }
    }

    clearTimeout(restTimerRef.current)
    setRestSeconds(restSecs)
  }, [planExercises, allSets])

  const updateField = useCallback((key, setIdx, field, value) => {
    setAllSets(prev => {
      const sets = [...(prev[key] ?? [])]
      sets[setIdx] = { ...sets[setIdx], [field]: value }
      return { ...prev, [key]: sets }
    })
  }, [])

  const goTo = (idx) => {
    setCurrentIdx(idx)
    setShowViewAll(false)
    clearTimeout(restTimerRef.current)
    setRestSeconds(null)
  }

  const skipRest = () => {
    clearTimeout(restTimerRef.current)
    setRestSeconds(null)
    // Still show feedback if it was queued
    if (pendingFeedbackAfterRestRef.current) {
      setFeedbackExercise(pendingFeedbackAfterRestRef.current)
      setShowFeedback(true)
      pendingFeedbackAfterRestRef.current = null
    }
  }

  // ── Save session ──────────────────────────────────────────────────────────
  const finishSession = async () => {
    setSaving(true)
    try {
      const endTime   = new Date()
      const startTime = new Date(sessionStartRef.current)
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

      // Build completed-set rows for exercise_sets + PR check
      const completedSetRows = []
      planExercises.forEach((ex, idx) => {
        ;(allSets[String(idx)] ?? []).forEach(s => {
          if (!s.completed) return
          completedSetRows.push({
            session_logged_id: logged?.id,
            exercise_id:       ex.exercise_id ?? null,
            exercise_name:     ex.exercise_name ?? ex.name ?? null,
            set_number:        s.setNum,
            reps:              parseInt(s.reps)     || null,
            weight_kg:         parseFloat(s.weight) || null,
            rest_secs:         ex.rest_secs ?? 90,
          })
        })
      })

      if (logged && completedSetRows.length) {
        await supabase.from('exercise_sets').insert(completedSetRows)
      }

      // Personal records check (strength only — needs exercise_id + weight)
      let newPRs = []
      if (logged) {
        const prSets = completedSetRows
          .filter(r => r.exercise_id && r.weight_kg > 0 && r.reps > 0)
          .map(r => ({
            exercise_id:   r.exercise_id,
            exercise_name: r.exercise_name,
            reps:          r.reps,
            weight_kg:     r.weight_kg,
          }))
        if (prSets.length) {
          newPRs = await checkAndSavePersonalRecords(userId, logged.id, prSets)
        }
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
          setsCount:     completedSetRows.length,
          setsLabel:     'sets',
          newPRs,
        },
      })
    } catch (e) {
      console.error('Session save error:', e)
    } finally {
      setSaving(false)
    }
  }

  // ── Format helpers ────────────────────────────────────────────────────────
  const fmtElapsed = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  // ── Loading / empty / done states ─────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-[#FAFAF7]">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!planExercises.length) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-[#FAFAF7] px-6 text-center gap-4">
        <p className="text-slate-500 text-sm">This session has no exercises yet.</p>
        <p className="text-slate-400 text-xs">Ask Rex to add exercises to this session, then try again.</p>
        <button onClick={() => navigate(-1)} className="text-teal-600 text-sm font-medium mt-2">← Go back</button>
      </div>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className="h-dvh flex flex-col bg-[#FAFAF7] overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shrink-0">
        <button
          onClick={() => {
            if (window.confirm('Exit session? Your progress won\'t be saved.')) navigate(-1)
          }}
          className="text-slate-400 text-sm font-medium w-10 text-left"
        >✕</button>

        <div className="text-center flex-1">
          <p className="text-sm font-bold text-slate-800 truncate leading-tight">
            {planSession.title || 'Session'}
          </p>
          <p className="text-xs text-slate-400 tabular-nums">{fmtElapsed(elapsed)}</p>
        </div>

        <div className="text-right w-10">
          <span className="text-sm font-bold text-slate-700">{currentIdx + 1}</span>
          <span className="text-xs text-slate-300">/{planExercises.length}</span>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* GIF panel — only for exercises with a gif_url */}
        {hasGif && (
          <div
            className="w-full bg-slate-900 flex items-center justify-center shrink-0"
            style={{ height: 240 }}
          >
            <img
              key={detail.gif_url}
              src={detail.gif_url}
              alt={currentExPlan.exercise_name ?? currentExPlan.name}
              className="h-full w-full object-contain"
            />
          </div>
        )}

        <div className="px-4 pt-4 pb-3">

          {/* Exercise name */}
          <h2 className="text-xl font-bold text-slate-800 capitalize leading-tight">
            {currentExPlan.exercise_name ?? currentExPlan.name ?? 'Exercise'}
          </h2>

          {/* Primary muscles chip */}
          {detail?.muscles_primary?.length > 0 && (
            <p className="text-xs text-teal-600 font-medium mt-1 mb-3 capitalize">
              {detail.muscles_primary.join(', ')}
            </p>
          )}

          {/* Section badge */}
          {currentExPlan.section === 'warm_up' && (
            <span className="inline-block text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-0.5 mb-3 uppercase tracking-wide">
              Warm Up
            </span>
          )}
          {currentExPlan.section === 'cool_down' && (
            <span className="inline-block text-xs font-bold text-blue-500 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-0.5 mb-3 uppercase tracking-wide">
              Cool Down
            </span>
          )}

          {/* DB descriptions: start / move / avoid — show whenever available */}
          {descriptions.length > 0 && (
            <div className="space-y-2.5 mb-4">
              {descriptions.map((d, i) => {
                const labels = ['Start position', 'Movement', 'Key point']
                const colours = ['text-teal-600', 'text-slate-500', 'text-amber-600']
                return (
                  <div key={i} className="flex gap-2.5">
                    <span className={`text-xs font-semibold w-24 shrink-0 mt-0.5 ${colours[i]}`}>
                      {labels[i]}
                    </span>
                    <p className="text-sm text-slate-600 leading-snug">{d}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* Technique cue — always show when present */}
          {currentExPlan.technique_cue && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3 mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">How to do it</p>
              <p className="text-sm text-slate-600 leading-snug">{currentExPlan.technique_cue}</p>
            </div>
          )}

          {/* Benefit — show when present */}
          {currentExPlan.benefit && (
            <div className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3 mb-4">
              <p className="text-xs font-semibold text-teal-500 uppercase tracking-wide mb-1">Why it's in your plan</p>
              <p className="text-sm text-teal-700 leading-snug">{currentExPlan.benefit}</p>
            </div>
          )}

          {/* Rest timer */}
          {restSeconds !== null && (
            <div className="mb-4 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-teal-600 uppercase tracking-wide">Rest</p>
                <p className="text-4xl font-bold text-teal-700 tabular-nums leading-none mt-1">
                  {restSeconds}<span className="text-xl font-semibold">s</span>
                </p>
              </div>
              <button
                onClick={skipRest}
                className="text-xs font-semibold text-teal-600 bg-teal-100 hover:bg-teal-200 active:bg-teal-300 px-4 py-2 rounded-xl transition-colors"
              >
                Skip ›
              </button>
            </div>
          )}

          {/* Set rows */}
          <div className="rounded-2xl border border-slate-200 overflow-hidden bg-white mb-2">
            {/* Header row */}
            <div className="grid grid-cols-12 bg-slate-50 border-b border-slate-100 px-3 py-2">
              <span className="col-span-1 text-xs font-bold text-slate-400 uppercase">#</span>
              <span className="col-span-3 text-xs font-bold text-slate-400 uppercase text-center">Target</span>
              <span className="col-span-3 text-xs font-bold text-slate-400 uppercase text-center">Reps</span>
              <span className="col-span-3 text-xs font-bold text-slate-400 uppercase text-center">kg</span>
              <span className="col-span-2 text-xs font-bold text-slate-400 uppercase text-center">✓</span>
            </div>

            {currentSets.map((s, i) => (
              <div
                key={i}
                className={`grid grid-cols-12 px-3 py-3 items-center border-t border-slate-100 transition-colors ${
                  s.completed ? 'bg-teal-50' : ''
                }`}
              >
                {/* Set number */}
                <span className="col-span-1 text-sm font-bold text-slate-400">{s.setNum}</span>

                {/* Target */}
                <span className="col-span-3 text-center text-xs text-slate-400">
                  {s.targetReps || '—'}
                  {s.targetWeight ? ` × ${s.targetWeight}` : ''}
                </span>

                {/* Reps input */}
                <div className="col-span-3 flex justify-center">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={s.reps}
                    onChange={e => updateField(currentKey, i, 'reps', e.target.value)}
                    disabled={s.completed}
                    className="w-12 text-center text-sm font-semibold border border-slate-200 rounded-xl py-1.5 bg-white disabled:bg-transparent disabled:border-transparent disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                {/* Weight input */}
                <div className="col-span-3 flex justify-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    value={s.weight}
                    onChange={e => updateField(currentKey, i, 'weight', e.target.value)}
                    disabled={s.completed}
                    placeholder="—"
                    className="w-14 text-center text-sm font-semibold border border-slate-200 rounded-xl py-1.5 bg-white disabled:bg-transparent disabled:border-transparent disabled:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                {/* Complete button */}
                <div className="col-span-2 flex justify-center">
                  {s.completed ? (
                    <span className="text-teal-500 font-bold text-lg">✓</span>
                  ) : (
                    <button
                      onClick={() => completeSet(currentKey, i)}
                      className="w-8 h-8 rounded-full border-2 border-slate-300 flex items-center justify-center text-slate-300 hover:border-teal-500 hover:text-teal-500 active:bg-teal-50 transition-colors"
                      aria-label="Complete set"
                    >
                      <svg viewBox="0 0 14 11" className="w-3.5 h-3.5" fill="none">
                        <path d="M1 5.5L5 9.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Bottom navigation bar ── */}
      <div className="bg-white border-t border-slate-100 px-4 pt-3 pb-5 shrink-0 space-y-2.5">
        {allDone ? (
          <button
            onClick={finishSession}
            disabled={saving}
            className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white py-4 rounded-2xl font-bold text-sm disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? 'Saving…' : '🎉  Finish Session'}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => goTo(Math.max(0, currentIdx - 1))}
              disabled={currentIdx === 0}
              className="flex-1 border border-slate-200 text-slate-600 py-4 rounded-2xl font-semibold text-sm disabled:opacity-30 active:bg-slate-50 transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => goTo(Math.min(planExercises.length - 1, currentIdx + 1))}
              disabled={currentIdx === planExercises.length - 1}
              className="flex-[2] bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white py-4 rounded-2xl font-bold text-sm disabled:opacity-30 transition-colors"
            >
              Next →
            </button>
          </div>
        )}

        <button
          onClick={() => setShowViewAll(true)}
          className="w-full text-center text-xs py-0.5 flex items-center justify-center gap-1.5"
        >
          <span className="font-semibold text-slate-500">{completedExCount}/{planExercises.length} done</span>
          <span className="text-slate-400">· View all ↑</span>
        </button>
      </div>

      {/* ── Exercise feedback card overlay ── */}
      {showFeedback && feedbackExercise && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowFeedback(false); setFeedbackExercise(null) }}
          />
          <div className="relative px-4 pb-8 pt-2">
            <ExerciseFeedbackCard
              exerciseId={feedbackExercise.exerciseId}
              exerciseName={feedbackExercise.exerciseName}
              sessionLoggedId={null}
              onComplete={() => { setShowFeedback(false); setFeedbackExercise(null) }}
            />
          </div>
        </div>
      )}

      {/* ── View All slide-up panel ── */}
      {showViewAll && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowViewAll(false)}
          />
          <div className="relative bg-white rounded-t-3xl max-h-[78vh] flex flex-col shadow-2xl">
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
              <h3 className="font-bold text-slate-800">All Exercises</h3>
              <button
                onClick={() => setShowViewAll(false)}
                className="text-sm font-semibold text-teal-600"
              >
                Done
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {planExercises.map((ex, idx) => {
                const key      = String(idx)
                const done     = isExDone(key)
                const sets     = allSets[key] ?? []
                const doneCount = sets.filter(s => s.completed).length
                const isCurrent = idx === currentIdx
                const prevSection = idx > 0 ? planExercises[idx - 1].section : null
                const showHeader  = ex.section && ex.section !== prevSection
                const sectionLabel = ex.section === 'warm_up' ? 'Warm Up' : ex.section === 'cool_down' ? 'Cool Down' : 'Workout'
                return (
                  <div key={idx}>
                  {showHeader && (
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 pt-3 pb-1">
                      {sectionLabel}
                    </p>
                  )}
                  <button
                    onClick={() => goTo(idx)}
                    className={`w-full flex items-center justify-between p-3.5 rounded-2xl border text-left transition-colors ${
                      done      ? 'border-teal-200 bg-teal-50'
                      : isCurrent ? 'border-slate-800 bg-slate-50'
                               : 'border-slate-200 bg-white active:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        done      ? 'bg-teal-500 text-white'
                        : isCurrent ? 'bg-slate-800 text-white'
                                 : 'bg-slate-100 text-slate-400'
                      }`}>
                        {done ? '✓' : idx + 1}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 capitalize leading-tight">
                          {ex.exercise_name ?? ex.name ?? 'Exercise'}
                        </p>
                        <p className="text-xs text-slate-400">
                          {ex.sets} sets × {ex.reps} reps
                          {ex.weight_kg ? ` · ${ex.weight_kg} kg` : ''}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs font-bold shrink-0 ${done ? 'text-teal-600' : 'text-slate-400'}`}>
                      {done ? 'Done' : `${doneCount}/${sets.length}`}
                    </span>
                  </button>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

