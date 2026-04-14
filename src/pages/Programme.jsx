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
import ProgrammeSummaryCollapsible from '../components/ProgrammeSummaryCollapsible'
import { duplicateBlock } from '../utils/duplicateBlock'

// ─────────────────────────────────────────────────────────────────────────────
// Returns YYYY-MM-DD in local time (toISOString() uses UTC and drifts by tz offset)
// ─────────────────────────────────────────────────────────────────────────────
function localDateStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

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
// Clear plan confirm modal
// ─────────────────────────────────────────────────────────────────────────────
function ClearModal({ onConfirm, onCancel, loading }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
        <h2 className="text-base font-semibold text-slate-900 mb-2">Clear current plan?</h2>
        <p className="text-sm text-slate-500 mb-6 leading-relaxed">
          This will archive all current programme data so Rex can start fresh.
          Your logged sessions and personal records are unaffected.
        </p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors rounded-lg disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="px-4 py-2 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {loading ? 'Clearing…' : 'Clear plan'}
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
        .in('session_logged_id', loggedIds)
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
function IdentityRow({ label, value, domains }) {
  return (
    <div>
      <p className="text-teal-500 text-[10px] font-bold tracking-widest uppercase mb-1.5">
        {label}
      </p>
      {domains ? (
        <div className="space-y-1">
          {domains.map((d, i) => (
            <p key={i} className="text-slate-300 text-xs leading-relaxed">
              {d.domain}: {d.clinical_justification}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-slate-300 text-xs leading-relaxed">{value}</p>
      )}
    </div>
  )
}

function HowRexBuiltThis({ sessionIdentities, sessionNumber }) {
  const [open, setOpen] = useState(false)
  const identity = (sessionIdentities ?? []).find(i => i.session_number === sessionNumber) ?? null

  return (
    <div className="mt-4 rounded-2xl border border-slate-700 bg-[#132d4a] overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-teal-400 text-sm font-semibold tracking-wide">
          How Rex built this
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={[
            'w-4 h-4 text-teal-400 shrink-0 transition-transform duration-300',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      <div
        className={[
          'transition-all duration-300 ease-in-out overflow-hidden',
          open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
        ].join(' ')}
      >
        <div className="px-5 pb-5 flex flex-col gap-4 border-t border-slate-700 pt-4">
          {identity ? (
            <>
              <IdentityRow
                label="Session focus"
                value={`${identity.primary_domain} — ${identity.primary_focus}`}
              />
              <IdentityRow
                label="Movement theme"
                value={identity.movement_theme}
              />
              <IdentityRow
                label="Why this session"
                value={identity.identity_reasoning}
              />
              <IdentityRow
                label="Supporting elements"
                value={
                  !identity.supporting_domains?.length
                    ? `None — this is a focused ${identity.primary_domain} session.`
                    : undefined
                }
                domains={identity.supporting_domains?.length ? identity.supporting_domains : null}
              />
            </>
          ) : (
            <p className="text-slate-400 text-xs leading-relaxed">
              Session reasoning not available for this programme.{' '}
              Generate a new programme to see Rex&apos;s thinking.
            </p>
          )}
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors text-left mt-1"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function SessionDetail({ session, exerciseMap, sessionIdentities }) {
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
            {session.exercises_json.map((ex, i) => {
              const dbEx = ex.exercise_id ? (exerciseMap[ex.exercise_id] ?? null) : null
              return (
                <div key={i} className="space-y-1">
                  {/* GIF — only when available, capped at 360px */}
                  {dbEx?.gif_url && (
                    <img
                      src={dbEx.gif_url}
                      alt={ex.name ?? ex.exercise_name}
                      style={{ maxWidth: 360 }}
                      className="rounded-lg w-full object-cover mb-1"
                    />
                  )}
                  {/* Name + prescription */}
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
                  {/* Muscles */}
                  {dbEx?.muscles_primary?.length > 0 && (
                    <p className="text-[10px] text-slate-400">
                      {dbEx.muscles_primary.join(' · ')}
                    </p>
                  )}
                  {/* DB descriptions (Start / Move / Avoid) or fallback to technique_cue */}
                  {dbEx ? (
                    <div className="space-y-0.5 mt-0.5">
                      {dbEx.description_start && (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          <span className="font-semibold text-slate-500">Start</span>{' '}{dbEx.description_start}
                        </p>
                      )}
                      {dbEx.description_move && (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          <span className="font-semibold text-slate-500">Move</span>{' '}{dbEx.description_move}
                        </p>
                      )}
                      {dbEx.description_avoid && (
                        <p className="text-xs text-slate-400 leading-relaxed">
                          <span className="font-semibold text-slate-500">Avoid</span>{' '}{dbEx.description_avoid}
                        </p>
                      )}
                    </div>
                  ) : ex.technique_cue ? (
                    <p className="text-xs text-slate-400 italic mt-0.5 leading-relaxed">
                      {ex.technique_cue}
                    </p>
                  ) : null}
                </div>
              )
            })}
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

      {/* How Rex built this */}
      <HowRexBuiltThis
        sessionIdentities={sessionIdentities}
        sessionNumber={session.session_number}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Session card
// ─────────────────────────────────────────────────────────────────────────────
function SessionCard({ session, goalsMap, exerciseMap, sessionIdentities, detailExpanded, onToggleDetail, onStart, onRestart, startingId,
                       pushingToPlanner, plannerConfirm, onAddToPlanner }) {
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
        {detailExpanded && <SessionDetail session={session} exerciseMap={exerciseMap} sessionIdentities={sessionIdentities} />}

        {/* Action row */}
        <div className="mt-4">
          {session.status === 'planned' && (
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => onStart(session)}
                disabled={isStarting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60 bg-[#1A3A5C] hover:bg-[#152f4c]"
              >
                {isStarting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Starting…
                  </>
                ) : (
                  'Start session'
                )}
              </button>
              {plannerConfirm?.[session.id] ? (
                <span className="text-xs text-emerald-600 font-semibold">Added to planner ✓</span>
              ) : (
                <button
                  onClick={() => onAddToPlanner(session)}
                  disabled={!!pushingToPlanner?.[session.id]}
                  className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border border-[#1A3A5C] text-[#1A3A5C] hover:bg-[#EEF2F7] disabled:opacity-60 transition-colors"
                >
                  {pushingToPlanner?.[session.id] ? (
                    <>
                      <span className="w-3 h-3 border-2 border-[#1A3A5C]/30 border-t-[#1A3A5C] rounded-full animate-spin" />
                      Adding…
                    </>
                  ) : (
                    'Add to planner →'
                  )}
                </button>
              )}
            </div>
          )}

          {session.status === 'moved' && (
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => onStart(session)}
                disabled={isStarting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60 bg-[#1A3A5C] hover:bg-[#152f4c]"
              >
                {isStarting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Starting…
                  </>
                ) : (
                  'Start session'
                )}
              </button>
              <span className="text-xs text-emerald-600 font-semibold">In your planner ✓</span>
              <button
                onClick={() => navigate('/planner')}
                className="text-xs text-[#1A3A5C] underline underline-offset-2 hover:text-[#152f4c]"
              >
                View in planner →
              </button>
            </div>
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
  const [loading, setLoading]         = useState(true)
  const [programme, setProgramme]     = useState(null)
  const [sessions, setSessions]       = useState([])
  const [plannedSessions, setPlannedSessions] = useState([])
  const [goalsMap, setGoalsMap]       = useState({})
  const [currentWeek, setCurrentWeek] = useState(1)
  const [exerciseMap,  setExerciseMap]  = useState({})

  // ── UI state ───────────────────────────────────────────────────────────────
  const [expandedWeeks, setExpandedWeeks]   = useState({})
  const [expandedCards, setExpandedCards]   = useState({})
  const [showRebuildModal, setShowRebuildModal] = useState(false)
  const [showClearModal,   setShowClearModal]   = useState(false)
  const [clearing,         setClearing]         = useState(false)
  const [startingId, setStartingId]         = useState(null)
  const [startError, setStartError]         = useState('')
  const [activatingWeek, setActivatingWeek] = useState(null)
  const [pushingToPlanner, setPushingToPlanner] = useState({})
  const [pushingWeek,      setPushingWeek]      = useState(null)
  const [plannerConfirm,   setPlannerConfirm]   = useState({})
  const [weekPushConfirm,  setWeekPushConfirm]  = useState({})
  const [duplicatingLevel, setDuplicatingLevel] = useState(null)
  const [duplicateError,   setDuplicateError]   = useState('')

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

      console.log('[Programme] user id:', userId)
      console.log('[Programme] sessions query result:', prog, sess)
      console.log('[Programme] session count:', sess.length)

      // Build goals lookup map
      const gMap = {}
      for (const g of goalsResult.data ?? []) {
        gMap[g.id] = g.goal_statement
      }

      setProgramme(prog)
      setSessions(sess)
      setGoalsMap(gMap)

      // ── Fallback: when no programme_sessions exist, show sessions_planned ──
      if (!prog) {
        const { data: planned, error: plannedErr } = await supabase
          .from('sessions_planned')
          .select('id, date, session_type, title, duration_mins, purpose_note, exercises_json, status')
          .eq('user_id', userId)
          .eq('status', 'planned')
          .order('date', { ascending: true })
        console.log('[Programme] sessions_planned fallback result:', planned, plannedErr)
        if (!cancelled) setPlannedSessions(planned ?? [])
      }

      // ── Fetch exercise details for all exercises across all sessions ────────
      const allIds = [...new Set(
        sess.flatMap(s => (s.exercises_json ?? []).map(ex => ex.exercise_id).filter(Boolean))
      )]
      if (allIds.length > 0) {
        const { data: exRows } = await supabase
          .from('exercises')
          .select('id, gif_url, description_start, description_move, description_avoid, muscles_primary')
          .in('id', allIds)
        if (!cancelled) {
          const eMap = {}
          for (const row of exRows ?? []) eMap[row.id] = row
          setExerciseMap(eMap)
        }
      }

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

  // ── Clear plan — archives ALL programmes regardless of status ───────────────
  // Used when a plan is stuck (e.g. created but never properly activated, or
  // Rex failed partway through a rebuild leaving a partial record).
  const handleClearConfirm = async () => {
    setClearing(true)
    try {
      await supabase
        .from('programmes')
        .update({ status: 'archived', last_modified_at: new Date().toISOString() })
        .eq('user_id', userId)
        .neq('status', 'archived')   // archive anything not already archived
      // Reset local state so the empty state renders immediately
      setProgramme(null)
      setSessions([])
      setShowClearModal(false)
    } catch (err) {
      console.error('[Programme] handleClearConfirm failed:', err)
    } finally {
      setClearing(false)
    }
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
      const goalId  = Array.isArray(sess.goal_ids) && sess.goal_ids.length > 0
        ? sess.goal_ids[0]
        : null

      // Derive scheduled date from programme start + week_number offset
      const DOW_NAME = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
        thursday: 4, friday: 5, saturday: 6
      }
      const rawDow = sess.day_of_week
      const targetDow = typeof rawDow === 'number'
        ? rawDow
        : (DOW_NAME[String(rawDow ?? '').toLowerCase().trim()] ?? 1)
      const weekOffset = ((sess.week_number ?? 1) - 1) * 7
      const progStart = programme?.start_date
        ? new Date(programme.start_date + 'T00:00:00')
        : new Date()
      progStart.setHours(0, 0, 0, 0)
      const progStartDow = progStart.getDay()
      let daysFromStart = targetDow - progStartDow
      if (daysFromStart < 0) daysFromStart += 7
      const sessionDate = new Date(progStart)
      sessionDate.setDate(progStart.getDate() + weekOffset + daysFromStart)
      const dateStr = localDateStr(sessionDate)

      const allExercises = [
        ...(sess.warm_up_json ?? []).map(ex => ({
          exercise_id:   null,
          exercise_name: ex.name ?? ex.exercise_name ?? null,
          section:       'warm_up',
          sets:          ex.sets ?? 1,
          reps:          ex.reps ?? null,
          weight_kg:     null,
          rest_secs:     0,
          technique_cue: null,
          benefit:       null,
        })),
        ...(sess.exercises_json ?? []).map(ex => ({
          exercise_id:   ex.exercise_id ?? null,
          exercise_name: ex.name ?? ex.exercise_name ?? null,
          section:       ex.slot ?? ex.section ?? 'main',
          sets:          ex.sets ?? null,
          reps:          ex.reps ?? null,
          weight_kg:     ex.weight_kg ?? null,
          rest_secs:     ex.rest_secs ?? null,
          technique_cue: ex.technique_cue ?? null,
          benefit:       ex.benefit ?? null,
        })),
        ...(sess.cool_down_json ?? []).map(ex => ({
          exercise_id:   null,
          exercise_name: ex.name ?? ex.exercise_name ?? null,
          section:       'cool_down',
          sets:          ex.sets ?? 1,
          reps:          ex.reps ?? null,
          weight_kg:     null,
          rest_secs:     0,
          technique_cue: null,
          benefit:       null,
        })),
      ]

      const { data: newRow, error: insertError } = await supabase
        .from('sessions_planned')
        .insert({
          user_id:        userId,
          date:           dateStr,
          session_type:   sess.session_type,
          duration_mins:  sess.duration_mins,
          title:          sess.title,
          purpose_note:   sess.purpose_note,
          goal_id:        goalId,
          exercises_json: allExercises,
          status:         'planned',
        })
        .select()
        .single()

      if (insertError || !newRow) {
        throw new Error(insertError?.message ?? 'Failed to create planned session')
      }

      await linkSessionToPlanner(sess.id, newRow.id, dateStr)

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

  // ── Add a single programme session to the planner ─────────────────────────
  async function handleAddToPlanner(sess) {
    const DOW_NAME = {
      sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
      thursday: 4, friday: 5, saturday: 6
    }
    const rawDow = sess.day_of_week
    const targetDow = typeof rawDow === 'number'
      ? rawDow
      : (DOW_NAME[String(rawDow ?? '').toLowerCase().trim()] ?? 1)

    // Base date = programme start + (week_number - 1) weeks
    const weekOffset = ((sess.week_number ?? 1) - 1) * 7
    const progStart = programme?.start_date
      ? new Date(programme.start_date + 'T00:00:00')
      : new Date()
    progStart.setHours(0, 0, 0, 0)

    // Find the correct day within that week
    const progStartDow = progStart.getDay()
    let daysFromStart = targetDow - progStartDow
    if (daysFromStart < 0) daysFromStart += 7

    const sessionDate = new Date(progStart)
    sessionDate.setDate(progStart.getDate() + weekOffset + daysFromStart)
    const dateStr = localDateStr(sessionDate)

    setPushingToPlanner(p => ({ ...p, [sess.id]: true }))
    try {
      const { data: inserted, error } = await supabase
        .from('sessions_planned')
        .insert({
          user_id:        userId,
          date:           dateStr,
          session_type:   sess.session_type,
          title:          sess.title,
          duration_mins:  sess.duration_mins,
          purpose_note:   sess.purpose_note ?? '',
          exercises_json: sess.exercises_json ?? [],
          status:         'planned',
        })
        .select('id')
        .single()

      if (error) throw error

      await linkSessionToPlanner(sess.id, inserted.id, dateStr)

      setSessions(prev =>
        prev.map(s =>
          s.id === sess.id
            ? { ...s, status: 'moved', sessions_planned_id: inserted.id }
            : s
        )
      )

      setPlannerConfirm(p => ({ ...p, [sess.id]: true }))
      setTimeout(
        () => setPlannerConfirm(p => { const n = { ...p }; delete n[sess.id]; return n }),
        3000
      )
    } catch (err) {
      console.error('[Programme] handleAddToPlanner failed:', err)
    } finally {
      setPushingToPlanner(p => { const n = { ...p }; delete n[sess.id]; return n })
    }
  }

  // ── Push all planned sessions for a week to the planner ───────────────────
  async function handlePushWeekToPlanner(weekNum) {
    const toAdd = (sessionsByWeek[weekNum] ?? []).filter(s => s.status === 'planned')
    if (toAdd.length === 0) return
    setPushingWeek(weekNum)
    try {
      await Promise.all(toAdd.map(s => handleAddToPlanner(s)))
      setWeekPushConfirm(p => ({ ...p, [weekNum]: true }))
      setTimeout(
        () => setWeekPushConfirm(p => { const n = { ...p }; delete n[weekNum]; return n }),
        3000
      )
    } finally {
      setPushingWeek(null)
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
      setStartError(`Couldn't set up Level ${targetWeek}: ${err.message}`)
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

  // ── Duplicate a level's sessions into a new level ─────────────────────────
  const handleDuplicateLevel = async (sourceWeekNum, targetWeekNum) => {
    if (duplicatingLevel || !programme) return
    setDuplicatingLevel(targetWeekNum)
    setDuplicateError('')
    try {
      const sourceSessions = sessions.filter(s => s.week_number === sourceWeekNum)
      if (!sourceSessions.length) throw new Error('No sessions found for this level')

      const newRows = sourceSessions.map(({ id, created_at, sessions_planned_id, ...rest }) => ({
        ...rest,
        week_number: targetWeekNum,
        block_number: Math.ceil(targetWeekNum / 2),
        status: 'planned',
        sessions_planned_id: null,
        scheduled_date: null,
      }))

      const { data: inserted, error: insertError } = await supabase
        .from('programme_sessions')
        .insert(newRows)
        .select()
      if (insertError) throw insertError

      // Extend programme total_weeks if needed
      if (targetWeekNum > (programme.total_weeks ?? 0)) {
        await supabase
          .from('programmes')
          .update({ total_weeks: targetWeekNum })
          .eq('id', programme.id)
        setProgramme(prev => ({ ...prev, total_weeks: targetWeekNum }))
      }

      setSessions(prev => [...prev, ...(inserted ?? [])])
    } catch (err) {
      console.error('[Programme] handleDuplicateLevel failed:', err)
      setDuplicateError(`Couldn't duplicate level: ${err.message}`)
    } finally {
      setDuplicatingLevel(null)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <Spinner />

  // ── No programme_sessions — show sessions_planned if Rex built any ─────────
  if (!programme) {
    if (plannedSessions.length > 0) {
      return (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div style={{ backgroundColor: '#1A3A5C' }} className="text-white px-5 pt-6 pb-5 shadow-md">
            <h1 className="text-xl font-bold leading-tight mb-1">Your Training Plan</h1>
            <p className="text-sm text-white/70 mb-4">
              {plannedSessions.length} session{plannedSessions.length !== 1 ? 's' : ''} planned by Rex
            </p>
            <button
              onClick={() => navigate('/chat/rex')}
              className="px-4 py-2 rounded-xl text-sm font-semibold border border-white/50 text-white hover:bg-white/10 transition-colors"
            >
              Talk to Rex
            </button>
          </div>

          {/* Session cards */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {plannedSessions.map(s => {
              const col = sessionColour(s.session_type)
              const [y, m, d] = s.date.split('-').map(Number)
              const dt = new Date(y, m - 1, d)
              const dayLabel = dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
              const exercises = s.exercises_json ?? []
              const expanded = expandedCards[s.id]

              return (
                <div
                  key={s.id}
                  className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
                  style={{ borderLeftColor: col, borderLeftWidth: 4, borderLeftStyle: 'solid' }}
                >
                  <div className="p-4">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <span className="text-sm font-semibold text-slate-900">{s.title}</span>
                      <span
                        className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ color: col, backgroundColor: col + '20' }}
                      >
                        {s.session_type.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {/* Date + duration */}
                    <p className="text-xs text-slate-500 mb-1">
                      {dayLabel} · {s.duration_mins} min
                    </p>
                    {/* Purpose */}
                    {s.purpose_note && (
                      <p className="text-xs text-slate-400 italic mb-2 leading-relaxed">{s.purpose_note}</p>
                    )}
                    {/* Expand exercises */}
                    {exercises.length > 0 && (
                      <button
                        onClick={() => toggleCard(s.id)}
                        className="text-xs text-[#1A3A5C] font-medium hover:underline mt-1"
                      >
                        {expanded ? 'Hide exercises' : `View ${exercises.length} exercise${exercises.length !== 1 ? 's' : ''}`}
                      </button>
                    )}
                    {expanded && (
                      <div className="mt-3 space-y-2">
                        {exercises.map((ex, i) => (
                          <div key={i} className="text-xs text-slate-700">
                            <span className="font-medium">{ex.exercise_name}</span>
                            {ex.sets && ex.reps ? ` — ${ex.sets}×${ex.reps}` : ''}
                            {ex.technique_cue && (
                              <p className="text-slate-400 mt-0.5 leading-relaxed">{ex.technique_cue}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )
    }

    // True empty state — no programme and no planned sessions
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

      {/* ── Clear modal ───────────────────────────────────────────────────── */}
      {showClearModal && (
        <ClearModal
          onConfirm={handleClearConfirm}
          onCancel={() => setShowClearModal(false)}
          loading={clearing}
        />
      )}

      {/* ── Programme header ──────────────────────────────────────────────── */}
      <div style={{ backgroundColor: '#1A3A5C' }} className="text-white px-5 pt-6 pb-5 shadow-md">
        <h1 className="text-xl font-bold leading-tight mb-1">{programme.title}</h1>
        <p className="text-sm text-white/70 mb-4">
          {programme.total_weeks}-level programme · Level {currentWeek} of {programme.total_weeks} · Active
        </p>
        <div className="flex gap-2 flex-wrap">
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
          <button
            onClick={() => setShowClearModal(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-red-400/60 text-red-200 hover:bg-red-500/20 transition-colors"
          >
            Clear plan
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

      {/* ── How Rex built this ────────────────────────────────────────────── */}
      {(() => {
        // Pull phase_aim and session_allocation_rationale from the current
        // week's sessions (use the first row that has a value).
        const currentWeekSessions = sessionsByWeek[currentWeek] ?? []
        const phaseAim = currentWeekSessions.find(s => s.phase_aim)?.phase_aim
          ?? sessions.find(s => s.phase_aim)?.phase_aim
          ?? null
        const sessionAllocationRationale =
          currentWeekSessions.find(s => s.session_allocation_rationale)?.session_allocation_rationale
          ?? sessions.find(s => s.session_allocation_rationale)?.session_allocation_rationale
          ?? null

        return (
          <div className="px-4 pt-4 bg-white">
            <ProgrammeSummaryCollapsible
              programmeAim={programme.programme_aim ?? null}
              phaseAim={phaseAim}
              sessionAllocationRationale={sessionAllocationRationale}
              capabilityGapProfile={programme.capability_gap_profile_json ?? null}
            />
          </div>
        )
      })()}

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
        {(() => {
          const maxBuilt = sessions.length > 0
            ? Math.max(...sessions.map(s => s.week_number))
            : 0
          const displayMax = Math.max(programme.total_weeks ?? 4, maxBuilt + 1)
          return Array.from({ length: displayMax }, (_, i) => i + 1)
        })().map(weekNum => {
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
                    Level {weekNum}
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
                  {/* Push week button */}
                  {weekSessions.some(s => s.status === 'planned') && (
                    weekPushConfirm[weekNum] ? (
                      <span className="text-[10px] text-emerald-600 font-semibold whitespace-nowrap">Level added ✓</span>
                    ) : (
                      <button
                        onClick={e => { e.stopPropagation(); handlePushWeekToPlanner(weekNum) }}
                        disabled={pushingWeek === weekNum}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white bg-[#1A3A5C] hover:bg-[#152f4c] disabled:opacity-60 transition-colors whitespace-nowrap"
                      >
                        {pushingWeek === weekNum ? (
                          <>
                            <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Pushing…
                          </>
                        ) : (
                          'Push week →'
                        )}
                      </button>
                    )
                  )}
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
                    (() => {
                      const latestBuiltWeek = sessions.length > 0
                        ? Math.max(...sessions.filter(s => s.week_number < weekNum).map(s => s.week_number), 0)
                        : 0
                      const hasTemplate = latestBuiltWeek > 0 && latestBuiltWeek === weekNum - 1

                      return (
                        <div className="py-4 flex flex-col items-start gap-4">
                          <p className="text-xs text-slate-400 italic">
                            Level {weekNum} hasn't been set up yet.
                          </p>

                          {/* ── Repeat same exercises (motor learning) */}
                          {hasTemplate && (
                            <div className="w-full">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1A3A5C] mb-1">
                                Repeat same exercises
                              </p>
                              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                                Copies Level {latestBuiltWeek} exactly — same exercises,
                                same structure. Increase load or reps to keep progressing.
                                Use this to consolidate movement quality before building
                                a new phase.
                              </p>
                              <button
                                onClick={() => handleDuplicateLevel(latestBuiltWeek, weekNum)}
                                disabled={!!duplicatingLevel}
                                className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-[#1A3A5C] border-2 border-[#1A3A5C] hover:bg-[#EEF2F7] disabled:opacity-60 transition-colors"
                              >
                                {duplicatingLevel === weekNum ? (
                                  <>
                                    <span className="w-3.5 h-3.5 border-2 border-[#1A3A5C]/30 border-t-[#1A3A5C] rounded-full animate-spin" />
                                    Duplicating…
                                  </>
                                ) : (
                                  `↻  Repeat Level ${latestBuiltWeek} as Level ${weekNum}`
                                )}
                              </button>
                            </div>
                          )}

                          {/* ── Divider */}
                          {hasTemplate && (
                            <div className="flex items-center gap-3 w-full">
                              <div className="flex-1 h-px bg-slate-200" />
                              <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">or</span>
                              <div className="flex-1 h-px bg-slate-200" />
                            </div>
                          )}

                          {/* ── Rex progressive generation */}
                          <div className="w-full">
                            {hasTemplate && (
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#1A3A5C] mb-1">
                                Build next level with overload
                              </p>
                            )}
                            <button
                              onClick={() => handleActivateWeek(weekNum)}
                              disabled={!!activatingWeek}
                              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-[#1A3A5C] hover:bg-[#152f4c] disabled:opacity-60 transition-colors shadow-sm"
                            >
                              {activatingWeek === weekNum ? (
                                <>
                                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  Building…
                                </>
                              ) : (
                                hasTemplate
                                  ? `↑  Build Level ${weekNum} with progressive overload`
                                  : `Set up Level ${weekNum} →`
                              )}
                            </button>
                            {!hasTemplate && (
                              <p className="text-[10px] text-slate-300 mt-2">
                                Rex generates progressive sessions based on your
                                programme's overload strategy.
                              </p>
                            )}
                          </div>

                          {/* ── Error */}
                          {duplicateError && (
                            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-lg px-3 py-2 w-full">
                              {duplicateError}
                              <button onClick={() => setDuplicateError('')} className="ml-2 text-red-400 hover:text-red-600">✕</button>
                            </p>
                          )}
                        </div>
                      )
                    })()
                  ) : (
                    <>
                      {weekSessions.map(s => (
                        <SessionCard
                          key={s.id}
                          session={s}
                          goalsMap={goalsMap}
                          exerciseMap={exerciseMap}
                          sessionIdentities={programme.session_identities ?? []}
                          detailExpanded={!!expandedCards[s.id]}
                          onToggleDetail={toggleCard}
                          onStart={handleStartSession}
                          onRestart={handleRestart}
                          startingId={startingId}
                          pushingToPlanner={pushingToPlanner}
                          plannerConfirm={plannerConfirm}
                          onAddToPlanner={handleAddToPlanner}
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
