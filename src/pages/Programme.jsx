import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  getFullProgramme,
  updateSessionStatus,
  linkSessionToPlanner,
} from '../coach/programmeService'
import { generateNextWeek } from '../coach/rexOrchestrator'

// ─────────────────────────────────────────────────────────────────────────────
// Colour map — session type → hex
// ─────────────────────────────────────────────────────────────────────────────
const SESSION_COLOUR = {
  gym_strength:    '#1A3A5C',
  pilates:         '#0D7377',
  yoga:            '#0D7377',
  hiit_bodyweight: '#D97706',
  kettlebell:      '#D97706',
  plyometrics:     '#D97706',
  active_recovery: '#9CA3AF',
  flexibility:     '#6B7280',
  coordination:    '#6B7280',
}

function sessionColour(type) {
  return SESSION_COLOUR[type] ?? '#9CA3AF'
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase / week helpers
// ─────────────────────────────────────────────────────────────────────────────
function parseWeekRange(weeks) {
  const parts = String(weeks).split('-').map(Number)
  return [parts[0], parts[1] ?? parts[0]]
}

function phaseForWeek(phases, w) {
  return (phases ?? []).find(p => {
    const [start, end] = parseWeekRange(p.weeks)
    return w >= start && w <= end
  }) ?? null
}

function calcCurrentWeek(createdAt, totalWeeks) {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  return Math.min(Math.max(Math.ceil(days / 7), 1), totalWeeks)
}

// ─────────────────────────────────────────────────────────────────────────────
// Spinner
// ─────────────────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-[#1A3A5C]/20 border-t-[#1A3A5C] rounded-full animate-spin" />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Rebuild confirm modal
// ─────────────────────────────────────────────────────────────────────────────
function RebuildModal({ onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Rebuild programme?</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          This will archive your current programme. Rex will build you a new one.
          Are you sure?
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-semibold bg-[#1A3A5C] text-white rounded-xl hover:bg-[#152f4c] transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Week Summary Bar — only rendered when every session is complete or skipped
// ─────────────────────────────────────────────────────────────────────────────
function WeekSummaryBar({ weekSessions }) {
  const completed = weekSessions.filter(s => s.status === 'complete').length
  const total     = weekSessions.length
  const pct       = total ? Math.round((completed / total) * 100) : 0

  const [heaviest, setHeaviest] = useState(null)

  useEffect(() => {
    const plannedIds = weekSessions
      .filter(s => s.sessions_planned_id)
      .map(s => s.sessions_planned_id)

    if (!plannedIds.length) return
    let cancelled = false

    async function load() {
      // Step 1: get sessions_logged rows linked to these planned sessions
      const { data: logged } = await supabase
        .from('sessions_logged')
        .select('id')
        .in('planned_session_id', plannedIds)

      const loggedIds = (logged ?? []).map(l => l.id)
      if (!loggedIds.length || cancelled) return

      // Step 2: find the heaviest set across those logged sessions
      const { data } = await supabase
        .from('exercise_sets')
        .select('exercise_name, weight_kg, reps')
        .in('session_id', loggedIds)
        .not('weight_kg', 'is', null)
        .gt('weight_kg', 0)
        .order('weight_kg', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!cancelled && data?.weight_kg) setHeaviest(data)
    }
    load()
    return () => { cancelled = true }
  }, [weekSessions])

  return (
    <div className="mb-3 bg-[#EEF2F7] rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-600">
          {completed} of {total} sessions completed
        </span>
        <span className="text-sm font-semibold text-[#1A3A5C]">{pct}%</span>
      </div>
      <div className="w-full bg-white rounded-full h-2 mb-2 overflow-hidden">
        <div
          className="bg-[#1A3A5C] h-2 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {heaviest && (
        <p className="text-xs text-slate-500 mt-1">
          Heaviest set: {heaviest.exercise_name} {heaviest.weight_kg}kg × {heaviest.reps}
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Session detail — warm-up / main / cool-down / coach note
// ─────────────────────────────────────────────────────────────────────────────
function SessionDetail({ session }) {
  return (
    <div className="mt-4 border-t border-slate-100 pt-4 space-y-4">
      {/* Warm-up */}
      {session.warm_up_json?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1A3A5C] mb-2">
            Warm-up
          </p>
          <div className="space-y-1">
            {session.warm_up_json.map((item, i) => (
              <p key={i} className="text-xs text-slate-600">
                {item.name}
                {item.duration_secs ? ` · ${item.duration_secs}s` : ''}
                {item.reps        ? ` · ${item.reps} reps`        : ''}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Main session */}
      {session.exercises_json?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1A3A5C] mb-2">
            Session
          </p>
          <div className="space-y-3">
            {session.exercises_json.map((ex, i) => (
              <div key={i}>
                <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5">
                  <span className="text-xs font-semibold text-slate-800">
                    {ex.name ?? ex.exercise_name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {ex.sets} × {ex.reps}
                    {ex.weight_kg ? ` · ${ex.weight_kg}kg` : ''}
                    {ex.rest_secs ? ` · ${ex.rest_secs}s rest` : ''}
                  </span>
                </div>
                {ex.technique_cue && (
                  <p className="text-xs text-slate-400 italic mt-0.5 leading-relaxed">
                    {ex.technique_cue}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cool-down */}
      {session.cool_down_json?.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1A3A5C] mb-2">
            Cool-down
          </p>
          <div className="space-y-1">
            {session.cool_down_json.map((item, i) => (
              <p key={i} className="text-xs text-slate-600">
                {item.name}
                {item.duration_secs ? ` · ${item.duration_secs}s` : ''}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Coach note */}
      {session.coach_note && (
        <div className="bg-[#EEF2F7] rounded-xl p-3">
          <p className="text-[10px] font-semibold text-[#1A3A5C] mb-1">Rex says:</p>
          <p className="text-xs text-slate-600 leading-relaxed">{session.coach_note}</p>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Session card
// ─────────────────────────────────────────────────────────────────────────────
function SessionCard({ session, goalsMap, detailExpanded, onToggleDetail, onStart, onRestart, startingId }) {
  const col = sessionColour(session.session_type)
  const isStarting = startingId === session.id

  // Goal chips
  const goalChips = (session.goal_ids ?? [])
    .filter(id => goalsMap[id])
    .map(id => (
      <span
        key={id}
        className="text-[10px] border border-[#1A3A5C] text-[#1A3A5C] px-2 py-0.5 rounded-full bg-white"
      >
        {goalsMap[id]}
      </span>
    ))

  // Status badge
  const badge = (() => {
    if (session.status === 'complete') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 whitespace-nowrap">
          Completed
        </span>
      )
    }
    if (session.status === 'skipped') {
      return (
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 line-through whitespace-nowrap">
          Skipped
        </span>
      )
    }
    return (
      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 whitespace-nowrap">
        Planned
      </span>
    )
  })()

  return (
    <div
      className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-3"
      style={{ borderLeftColor: col, borderLeftWidth: 4, borderLeftStyle: 'solid' }}
    >
      <div className="p-4">

        {/* Title row */}
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="text-sm font-semibold text-slate-900 leading-snug">
              {session.title}
            </span>
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ color: col, backgroundColor: col + '20' }}
            >
              {session.session_type.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="flex-shrink-0 mt-0.5">{badge}</div>
        </div>

        {/* Day + duration */}
        <p className="text-xs text-slate-500 mb-1">
          {session.day_of_week} · {session.duration_mins} min
        </p>

        {/* Purpose note */}
        {session.purpose_note && (
          <p className="text-xs text-slate-400 italic mb-2 leading-relaxed">
            {session.purpose_note}
          </p>
        )}

        {/* Goal chips */}
        {goalChips.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">{goalChips}</div>
        )}

        {/* Progression note */}
        {session.progression_note && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 mb-2">
            <p className="text-xs text-slate-500">↑ {session.progression_note}</p>
          </div>
        )}

        {/* Detail toggle */}
        <button
          onClick={() => onToggleDetail(session.id)}
          className="text-xs text-[#1A3A5C] font-medium hover:underline mt-1"
        >
          {detailExpanded ? 'Hide detail ↑' : 'View session detail ↓'}
        </button>

        {/* Detail section */}
        {detailExpanded && <SessionDetail session={session} />}

        {/* Action row */}
        <div className="mt-4">
          {(session.status === 'planned' || session.status === 'moved') && (
            <button
              onClick={() => onStart(session)}
              disabled={isStarting}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1A3A5C] hover:bg-[#152f4c] disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {isStarting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Starting…
                </>
              ) : (
                'Start session'
              )}
            </button>
          )}

          {session.status === 'complete' && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold text-emerald-600">✓ Completed</span>
              {session.sessions_planned_id && (
                // TODO: build session log detail screen at /log/:id
                null
              )}
            </div>
          )}

          {session.status === 'skipped' && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400 line-through">Skipped</span>
              <button
                onClick={() => onRestart(session.id)}
                className="text-xs text-[#1A3A5C] font-medium hover:underline"
              >
                Restart
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Programme component
// ─────────────────────────────────────────────────────────────────────────────
export default function Programme() {
  const { session: authSession } = useAuth()
  const userId = authSession.user.id
  const navigate = useNavigate()

  // ── Data state ─────────────────────────────────────────────────────────────
  const [loading, setLoading]       = useState(true)
  const [programme, setProgramme]   = useState(null)
  const [sessions, setSessions]     = useState([])
  const [goalsMap, setGoalsMap]     = useState({})
  const [currentWeek, setCurrentWeek] = useState(1)

  // ── UI state ───────────────────────────────────────────────────────────────
  const [expandedWeeks, setExpandedWeeks]   = useState({})
  const [expandedCards, setExpandedCards]   = useState({})
  const [showRebuildModal, setShowRebuildModal] = useState(false)
  const [startingId, setStartingId]         = useState(null)
  const [startError, setStartError]         = useState('')
  const [activatingWeek, setActivatingWeek] = useState(null)

  // ── Refs ───────────────────────────────────────────────────────────────────
  const weekRefs = useRef({})

  // ── Load data ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      const [progResult, goalsResult] = await Promise.all([
        getFullProgramme(userId),
        supabase
          .from('goals')
          .select('id, goal_statement')
          .eq('user_id', userId)
          .eq('status', 'active'),
      ])

      if (cancelled) return

      const prog = progResult.data?.programme ?? null
      const sess = progResult.data?.sessions   ?? []

      // Build goals lookup map
      const gMap = {}
      for (const g of goalsResult.data ?? []) {
        gMap[g.id] = g.goal_statement
      }

      setProgramme(prog)
      setSessions(sess)
      setGoalsMap(gMap)

      // Initialise accordion — expand current week only
      if (prog) {
        const cw = calcCurrentWeek(prog.created_at, prog.total_weeks)
        setCurrentWeek(cw)
        const initial = {}
        for (let w = 1; w <= prog.total_weeks; w++) {
          initial[w] = w === cw
        }
        setExpandedWeeks(initial)
      }

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userId])

  // ── Accordion toggle ───────────────────────────────────────────────────────
  const toggleWeek = (w) => setExpandedWeeks(prev => ({ ...prev, [w]: !prev[w] }))
  const toggleCard = (id) => setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }))

  // ── Phase pill scroll ──────────────────────────────────────────────────────
  const scrollToPhase = (phase) => {
    const [start] = parseWeekRange(phase.weeks)
    setExpandedWeeks(prev => ({ ...prev, [start]: true }))
    setTimeout(() => {
      weekRefs.current[start]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  // ── Rebuild plan ───────────────────────────────────────────────────────────
  const handleRebuildConfirm = async () => {
    setShowRebuildModal(false)
    // Archive the current active programme directly
    await supabase
      .from('programmes')
      .update({ status: 'archived', last_modified_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('status', 'active')
    // Navigate to Rex chat so the user can trigger a rebuild
    navigate('/chat/rex?intent=rebuild')
  }

  // ── Start session ──────────────────────────────────────────────────────────
  const handleStartSession = async (sess) => {
    if (startingId) return
    setStartError('')

    // If already linked to planner, navigate directly
    if (sess.sessions_planned_id) {
      navigate('/logger', { state: { sessionsPlannedId: sess.sessions_planned_id } })
      return
    }

    setStartingId(sess.id)
    try {
      const today   = new Date().toISOString().slice(0, 10)
      const goalId  = Array.isArray(sess.goal_ids) && sess.goal_ids.length > 0
        ? sess.goal_ids[0]
        : null

      const exercises = (sess.exercises_json ?? []).map(ex => ({
        exercise_id:   ex.exercise_id   ?? null,
        exercise_name: ex.name          ?? ex.exercise_name ?? null,
        sets:          ex.sets          ?? null,
        reps:          ex.reps          ?? null,
        weight_kg:     ex.weight_kg     ?? null,
        rest_secs:     ex.rest_secs     ?? null,
        technique_cue: ex.technique_cue ?? null,
      }))

      const { data: newRow, error: insertError } = await supabase
        .from('sessions_planned')
        .insert({
          user_id:        userId,
          date:           today,
          session_type:   sess.session_type,
          duration_mins:  sess.duration_mins,
          title:          sess.title,
          purpose_note:   sess.purpose_note,
          goal_id:        goalId,
          exercises_json: exercises,
          status:         'planned',
        })
        .select()
        .single()

      if (insertError || !newRow) {
        throw new Error(insertError?.message ?? 'Failed to create planned session')
      }

      await linkSessionToPlanner(sess.id, newRow.id, today)

      // Optimistic update — mark as moved immediately
      setSessions(prev =>
        prev.map(s =>
          s.id === sess.id
            ? { ...s, status: 'moved', sessions_planned_id: newRow.id }
            : s
        )
      )

      navigate('/logger', { state: { sessionsPlannedId: newRow.id } })
    } catch (err) {
      console.error('[Programme] handleStartSession failed:', err)
      setStartError(`Couldn't start session: ${err.message}`)
    } finally {
      setStartingId(null)
    }
  }

  // ── Activate an empty week — Rex generates progressive sessions ───────────
  // Rex receives the Week 1 template + the phase's overload strategy and
  // produces adjusted sets/reps/weight for the target week.
  const handleActivateWeek = async (targetWeek) => {
    if (activatingWeek || !programme) return
    setActivatingWeek(targetWeek)
    try {
      const week1Sessions = sessions.filter(s => s.week_number === 1)
      if (!week1Sessions.length) throw new Error('No Week 1 sessions found to progress from.')

      const { data: newSessions, error } = await generateNextWeek(
        programme,
        week1Sessions,
        targetWeek,
        userId,
        supabase,
      )
      if (error) throw error
      if (newSessions?.length) {
        setSessions(prev => [...prev, ...newSessions])
      }
    } catch (err) {
      console.error('[Programme] handleActivateWeek failed:', err)
      setStartError(`Couldn't set up Week ${targetWeek}: ${err.message}`)
    } finally {
      setActivatingWeek(null)
    }
  }

  // ── Restart skipped session ────────────────────────────────────────────────
  const handleRestart = async (sessionId) => {
    await updateSessionStatus(sessionId, 'planned')
    setSessions(prev =>
      prev.map(s => s.id === sessionId ? { ...s, status: 'planned' } : s)
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <Spinner />

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!programme) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] px-6 text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-md"
          style={{ backgroundColor: '#1A3A5C' }}
        >
          R
        </div>
        <h2 className="text-lg font-semibold text-slate-700 mb-2">
          Rex hasn't built your programme yet.
        </h2>
        <p className="text-sm text-slate-400 mb-6 max-w-xs leading-relaxed">
          Ask Rex to design a personalised training plan based on your goals,
          experience level, and available days.
        </p>
        <button
          onClick={() => navigate('/chat/rex')}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1A3A5C] hover:bg-[#152f4c] transition-colors shadow"
        >
          Ask Rex to build my programme
        </button>
      </div>
    )
  }

  const phases      = programme.phase_structure_json ?? []
  const activePhase = phaseForWeek(phases, currentWeek)

  // Group sessions by week
  const sessionsByWeek = {}
  for (let w = 1; w <= programme.total_weeks; w++) {
    sessionsByWeek[w] = sessions.filter(s => s.week_number === w)
  }

  return (
    <>
      {/* ── Rebuild modal ─────────────────────────────────────────────────── */}
      {showRebuildModal && (
        <RebuildModal
          onConfirm={handleRebuildConfirm}
          onCancel={() => setShowRebuildModal(false)}
        />
      )}

      {/* ── Programme header ──────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#1A3A5C' }} className="text-white px-5 pt-6 pb-5 shadow-md">
        <h1 className="text-xl font-bold leading-tight mb-1">{programme.title}</h1>
        <p className="text-sm text-white/70 mb-4">
          {programme.total_weeks}-week programme · Week {currentWeek} of {programme.total_weeks} · Active
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => navigate('/chat/rex')}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-white/50 text-white hover:bg-white/10 transition-colors"
          >
            Talk to Rex
          </button>
          <button
            onClick={() => setShowRebuildModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-white/50 text-white hover:bg-white/10 transition-colors"
          >
            Rebuild plan
          </button>
        </div>
      </div>

      {/* ── Phase strip ───────────────────────────────────────────────────── */}
      {phases.length > 1 && (
        <div
          className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-slate-200 bg-white"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
        >
          {phases.map(phase => {
            const isActive = activePhase?.phase === phase.phase
            return (
              <button
                key={phase.phase}
                onClick={() => scrollToPhase(phase)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-[#1A3A5C] text-white'
                    : 'bg-white border border-[#1A3A5C] text-[#1A3A5C] hover:bg-[#EEF2F7]'
                }`}
              >
                Phase {phase.phase} · {phase.label}
              </button>
            )
          })}
        </div>
      )}

      {/* ── Error banner ──────────────────────────────────────────────────── */}
      {startError && (
        <div className="mx-4 mt-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-xs text-red-600">{startError}</p>
          <button
            onClick={() => setStartError('')}
            className="text-xs text-red-400 mt-1 hover:text-red-600"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ── Week accordion ────────────────────────────────────────────────── */}
      <div className="divide-y divide-slate-100 bg-white">
        {Array.from({ length: programme.total_weeks }, (_, i) => i + 1).map(weekNum => {
          const weekSessions = sessionsByWeek[weekNum] ?? []
          const phase        = phaseForWeek(phases, weekNum)
          const isExpanded   = !!expandedWeeks[weekNum]
          const allDone      = weekSessions.length > 0 &&
            weekSessions.every(s => s.status === 'complete' || s.status === 'skipped')

          return (
            <div
              key={weekNum}
              ref={el => { weekRefs.current[weekNum] = el }}
            >
              {/* Week row header */}
              <div
                className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors select-none"
                onClick={() => toggleWeek(weekNum)}
              >
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm text-slate-900">
                    Week {weekNum}
                  </span>
                  {phase && (
                    <span className="text-xs text-slate-400">{phase.label}</span>
                  )}
                  {weekNum === currentWeek && (
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                      style={{ backgroundColor: '#1A3A5C' }}
                    >
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {/* Session type dots */}
                  <div className="flex gap-1">
                    {weekSessions.map(s => (
                      <div
                        key={s.id}
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: sessionColour(s.session_type) }}
                        title={s.session_type}
                      />
                    ))}
                  </div>
                  {/* Chevron */}
                  <svg
                    className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>

              {/* Expanded week content */}
              {isExpanded && (
                <div className="px-4 pt-1 pb-4 bg-slate-50/50">
                  {weekSessions.length === 0 ? (
                    <div className="py-4 flex flex-col items-start gap-3">
                      <p className="text-xs text-slate-400 italic">
                        Sessions for this week haven't been set up yet.
                      </p>
                      <button
                        onClick={() => handleActivateWeek(weekNum)}
                        disabled={!!activatingWeek}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-[#1A3A5C] hover:bg-[#152f4c] disabled:opacity-60 transition-colors shadow-sm"
                      >
                        {activatingWeek === weekNum ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Setting up…
                          </>
                        ) : (
                          `Set up Week ${weekNum} →`
                        )}
                      </button>
                      <p className="text-[10px] text-slate-300">
                        Rex will generate progressive sessions for this week based on your programme's overload strategy.
                      </p>
                    </div>
                  ) : (
                    <>
                      {weekSessions.map(s => (
                        <SessionCard
                          key={s.id}
                          session={s}
                          goalsMap={goalsMap}
                          detailExpanded={!!expandedCards[s.id]}
                          onToggleDetail={toggleCard}
                          onStart={handleStartSession}
                          onRestart={handleRestart}
                          startingId={startingId}
                        />
                      ))}
                      {allDone && <WeekSummaryBar weekSessions={weekSessions} />}
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom padding for nav */}
      <div className="h-8" />
    </>
  )
}
