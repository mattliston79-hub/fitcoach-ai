import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { SESSION_DOMAIN_MAP } from '../utils/activityDomains'

const ACTIVITY_ICONS = {
  run:  '🏃',
  ride: '🚴',
  swim: '🏊',
  row:  '🚣',
  walk: '🚶',
}

const FOCUS_LABELS = {
  easy:        'Easy effort',
  steady_state:'Steady state',
  tempo:       'Tempo',
  walk_run:    'Walk / run',
  fartlek:     'Fartlek',
  intervals:   'Intervals',
}

export default function CardioLogger() {
  const { sessionId } = useParams()
  const navigate      = useNavigate()
  const { session: authSession } = useAuth()
  const userId = authSession.user.id

  const [planSession, setPlanSession] = useState(null)
  const [cardio, setCardio]           = useState(null)   // cardio_activity_json
  const [loading, setLoading]         = useState(true)

  // Phase: warm_up | main | cool_down | done
  const [phase, setPhase] = useState('warm_up')

  // Elapsed timer
  const sessionStartRef = useRef(Date.now())
  const [elapsed, setElapsed] = useState(0)

  // Phase timer
  const [phaseSeconds, setPhaseSeconds] = useState(0)
  const phaseStartRef = useRef(Date.now())
  const phaseTimerRef = useRef(null)

  const [saving, setSaving] = useState(false)

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('sessions_planned')
        .select('*')
        .eq('id', sessionId)
        .single()

      if (error || !data) { navigate(-1); return }

      setPlanSession(data)
      setCardio(data.cardio_activity_json ?? null)
      setLoading(false)
    }
    load()
  }, [sessionId, navigate])

  // ── Elapsed timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000)),
      1000
    )
    return () => clearInterval(t)
  }, [])

  // ── Phase timer ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (loading || phase === 'done') return
    phaseStartRef.current = Date.now()
    setPhaseSeconds(0)
    phaseTimerRef.current = setInterval(
      () => setPhaseSeconds(Math.floor((Date.now() - phaseStartRef.current) / 1000)),
      1000
    )
    return () => clearInterval(phaseTimerRef.current)
  }, [phase, loading])

  // ── Save ─────────────────────────────────────────────────────────────────────
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
          date:               planSession.date ?? new Date().toISOString().slice(0, 10),
          session_type:       planSession.session_type,
          start_time:         startTime.toISOString(),
          end_time:           endTime.toISOString(),
          duration_mins:      durationMins,
        })
        .select('id')
        .single()

      await supabase
        .from('sessions_planned')
        .update({ status: 'complete' })
        .eq('id', sessionId)

      // ── Side effects ──────────────────────────────────────────────────────────
      try {
        const mapping = SESSION_DOMAIN_MAP[planSession.session_type] ?? { domain: 'physical', secondaryDomain: null }
        await supabase.from('activity_log').insert({
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
        await supabase.rpc('nudge_tree_score', { p_user_id: userId, p_domain: mapping.domain, p_delta: 5 })
        if (mapping.secondaryDomain) {
          await supabase.rpc('nudge_tree_score', { p_user_id: userId, p_domain: mapping.secondaryDomain, p_delta: 3 })
        }
      } catch (sideEffectErr) {
        console.error('Session side-effects error:', sideEffectErr)
      }

      navigate(`/post-session/${logged?.id ?? 'unknown'}`, {
        state: {
          title:         planSession.title || 'Session',
          sessionType:   planSession.session_type,
          durationMins,
          exerciseCount: 1,
          setsCount:     0,
          setsLabel:     '',
        },
      })
    } catch (e) {
      console.error('Cardio save error:', e)
    } finally {
      setSaving(false)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const fmtElapsed = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  const fmtMins    = (m) => `${m} min${m !== 1 ? 's' : ''}`

  // ── Loading ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="h-dvh flex items-center justify-center bg-sand-50">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Fallback: no cardio_activity_json ─────────────────────────────────────────
  if (!cardio) {
    return (
      <div className="h-dvh flex flex-col items-center justify-center bg-sand-50 px-6 text-center gap-4">
        <p className="text-slate-500 text-sm">No cardio plan found for this session.</p>
        <button onClick={() => navigate(-1)} className="text-teal-600 text-sm font-medium">← Go back</button>
      </div>
    )
  }

  const icon       = ACTIVITY_ICONS[cardio.activity] ?? '🏃'
  const focusLabel = FOCUS_LABELS[cardio.main_activity?.focus_type] ?? cardio.main_activity?.focus_type ?? ''

  // ── Phase content ─────────────────────────────────────────────────────────────
  const phases = [
    {
      key:         'warm_up',
      label:       'Warm Up',
      durationMins: cardio.warm_up?.duration_mins ?? 5,
      description: cardio.warm_up?.description,
      colour:      'text-amber-600',
      bg:          'bg-amber-50 border-amber-200',
    },
    {
      key:         'main',
      label:       focusLabel || 'Main Activity',
      durationMins: cardio.main_activity?.duration_mins ?? 30,
      description: cardio.main_activity?.focus_description,
      rpe:         cardio.main_activity?.rpe_target,
      colour:      'text-teal-600',
      bg:          'bg-teal-50 border-teal-200',
    },
    {
      key:         'cool_down',
      label:       'Cool Down',
      durationMins: cardio.cool_down?.duration_mins ?? 5,
      description: cardio.cool_down?.description,
      colour:      'text-blue-500',
      bg:          'bg-blue-50 border-blue-200',
    },
  ]

  const currentPhaseIdx = phases.findIndex(p => p.key === phase)
  const currentPhase    = phases[currentPhaseIdx]
  const isLastPhase     = currentPhaseIdx === phases.length - 1

  const advancePhase = () => {
    if (isLastPhase) {
      setPhase('done')
    } else {
      setPhase(phases[currentPhaseIdx + 1].key)
    }
  }

  // ── Done screen ───────────────────────────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="h-dvh flex flex-col bg-sand-50">
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-6xl mb-4">{icon}</div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Session complete!</h2>
          <p className="text-sm text-slate-500 mb-2">{planSession.title}</p>
          <p className="text-xs text-slate-400 mb-10">{fmtElapsed(elapsed)} elapsed</p>

          <button
            onClick={finishSession}
            disabled={saving}
            className="w-full max-w-xs bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white py-4 rounded-2xl font-bold text-sm disabled:opacity-50 transition-colors shadow-sm"
          >
            {saving ? 'Saving…' : '🎉  Save & finish'}
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 text-xs text-slate-400 hover:text-slate-600"
          >
            Exit without saving
          </button>
        </div>
      </div>
    )
  }

  // ── Main screen ───────────────────────────────────────────────────────────────
  return (
    <div className="h-dvh flex flex-col bg-sand-50 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 shrink-0">
        <button
          onClick={() => {
            if (window.confirm("Exit session? Your progress won't be saved.")) navigate(-1)
          }}
          className="text-slate-400 text-sm font-medium w-10 text-left"
        >✕</button>
        <div className="text-center flex-1">
          <p className="text-sm font-bold text-slate-800 truncate leading-tight">
            {planSession.title || 'Cardio Session'}
          </p>
          <p className="text-xs text-slate-400 tabular-nums">{fmtElapsed(elapsed)}</p>
        </div>
        <div className="w-10" />
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0 px-4 pt-5 pb-4 space-y-4">

        {/* Activity hero */}
        <div className="flex items-center gap-3 mb-2">
          <span className="text-4xl">{icon}</span>
          <div>
            <p className="text-lg font-bold text-slate-800 capitalize">{cardio.activity}</p>
            {planSession.purpose_note && (
              <p className="text-xs text-slate-500 leading-snug mt-0.5">{planSession.purpose_note}</p>
            )}
          </div>
        </div>

        {/* Phase steps */}
        {phases.map((p, idx) => {
          const isCurrent = p.key === phase
          const isDone    = idx < currentPhaseIdx
          return (
            <div
              key={p.key}
              className={[
                'rounded-2xl border px-4 py-4 transition-all',
                isCurrent ? p.bg : isDone ? 'border-teal-100 bg-teal-50/50 opacity-60' : 'border-slate-200 bg-white opacity-40',
              ].join(' ')}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {isDone && <span className="text-teal-500 font-bold">✓</span>}
                  <p className={`text-xs font-bold uppercase tracking-wide ${isCurrent ? p.colour : 'text-slate-400'}`}>
                    {p.label}
                  </p>
                </div>
                <p className="text-xs text-slate-400">{fmtMins(p.durationMins)}</p>
              </div>
              {p.description && (
                <p className="text-sm text-slate-600 leading-snug">{p.description}</p>
              )}
              {isCurrent && p.rpe && (
                <p className="text-xs text-teal-600 font-medium mt-2">Target effort: {p.rpe}</p>
              )}
              {isCurrent && (
                <p className="text-xs text-slate-400 mt-2 tabular-nums">
                  {fmtElapsed(phaseSeconds)} into this phase
                </p>
              )}
            </div>
          )
        })}

      </div>

      {/* Bottom bar */}
      <div className="bg-white border-t border-slate-100 px-4 pt-3 pb-5 shrink-0">
        <button
          onClick={advancePhase}
          className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white py-4 rounded-2xl font-bold text-sm transition-colors shadow-sm"
        >
          {isLastPhase ? 'Finish session →' : `Done with ${currentPhase?.label} →`}
        </button>
      </div>

    </div>
  )
}
