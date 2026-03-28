import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getFullProgramme } from '../coach/programmeService'
import { BADGE_LABELS } from '../utils/badges'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const NAVY = '#1A3A5C'
const TEAL = '#0D7377'

const SESSION_COLORS = {
  kettlebell:      'bg-amber-100 text-amber-800',
  hiit_bodyweight: 'bg-red-100 text-red-800',
  yoga:            'bg-violet-100 text-violet-800',
  pilates:         'bg-pink-100 text-pink-800',
  plyometrics:     'bg-orange-100 text-orange-800',
  coordination:    'bg-blue-100 text-blue-800',
  flexibility:     'bg-emerald-100 text-emerald-800',
  gym_strength:    'bg-slate-100 text-slate-700',
  mindfulness:     'bg-teal-100 text-teal-800',
}

const BADGE_COLORS = [
  'bg-amber-50 border-amber-200 text-amber-800',
  'bg-teal-50 border-teal-200 text-teal-800',
  'bg-violet-50 border-violet-200 text-violet-800',
  'bg-rose-50 border-rose-200 text-rose-800',
  'bg-blue-50 border-blue-200 text-blue-800',
  'bg-emerald-50 border-emerald-200 text-emerald-800',
  'bg-orange-50 border-orange-200 text-orange-800',
]

const PRACTICE_LABELS = {
  body_scan:          'Body Scan',
  breath_focus:       'Breath Focus',
  grounding:          'Grounding',
  mindful_walking:    'Mindful Walk',
  nature_observation: 'Nature Pause',
  pre_sleep:          'Pre-Sleep',
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function calcCurrentWeek(createdAt, totalWeeks) {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  return Math.min(Math.max(Math.ceil(days / 7), 1), totalWeeks)
}

/** Returns a Date set to Monday 00:00:00 of the week containing dateInput */
function getMondayOf(dateInput) {
  const d = new Date(dateInput)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

function fmtDateShort(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Epley estimated 1-rep max */
function e1RM(weight, reps) {
  if (!weight || !reps || weight <= 0 || reps <= 0) return 0
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

function sessionLabel(s) {
  if (s.session_type === 'mindfulness' && s.practice_type) {
    return PRACTICE_LABELS[s.practice_type] ?? 'Mindfulness'
  }
  return s.session_type?.replace(/_/g, ' ') ?? 'Session'
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared UI
// ─────────────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div
        className="w-10 h-10 rounded-full animate-spin"
        style={{ border: `4px solid ${NAVY}20`, borderTopColor: NAVY }}
      />
    </div>
  )
}

function SectionHeading({ children }) {
  return (
    <h2 className="text-base font-bold mb-3" style={{ color: NAVY }}>
      {children}
    </h2>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 1 — Programme Arc
// ─────────────────────────────────────────────────────────────────────────────

function weekBlockStyle(weekNum, sessions, currentWeek) {
  const base = { width: 32, height: 32, borderRadius: 6, flexShrink: 0, boxSizing: 'border-box' }

  // Future week
  if (weekNum > currentWeek) {
    return { ...base, backgroundColor: '#F3F4F6', border: '2px solid #D1D5DB' }
  }

  // No sessions set up for this week yet
  if (!sessions.length) {
    if (weekNum === currentWeek) {
      return { ...base, backgroundColor: 'white', border: `2px solid ${TEAL}` }
    }
    return { ...base, backgroundColor: '#F3F4F6', border: '2px solid #D1D5DB' }
  }

  // All sessions complete → solid navy
  if (sessions.every(s => s.status === 'complete')) {
    return { ...base, backgroundColor: NAVY }
  }

  // Current week (in progress) → teal outline
  if (weekNum === currentWeek) {
    return { ...base, backgroundColor: 'white', border: `2px solid ${TEAL}` }
  }

  // Past week, partially complete → half-filled gradient
  if (sessions.some(s => s.status === 'complete')) {
    return {
      ...base,
      background: `linear-gradient(to bottom, ${NAVY} 50%, white 50%)`,
      border: `2px solid ${NAVY}`,
    }
  }

  return { ...base, backgroundColor: '#F3F4F6', border: '2px solid #D1D5DB' }
}

function ProgrammeArc({ programme, programmeSessions, currentWeek }) {
  const totalWeeks  = programme.total_weeks
  const byWeek      = {}
  for (let w = 1; w <= totalWeeks; w++) {
    byWeek[w] = programmeSessions.filter(s => s.week_number === w)
  }
  const completedCount = programmeSessions.filter(s => s.status === 'complete').length
  const skippedCount   = programmeSessions.filter(s => s.status === 'skipped').length

  return (
    <div className="mb-8">
      <SectionHeading>Your Programme</SectionHeading>
      <div
        className="flex gap-2 pb-1"
        style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
      >
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
          <div key={w} style={weekBlockStyle(w, byWeek[w] ?? [], currentWeek)} title={`Week ${w}`} />
        ))}
      </div>
      <p className="text-xs text-slate-500 mt-2">
        {currentWeek} of {totalWeeks} weeks ·{' '}
        <span className="font-medium">{completedCount} sessions completed</span>
        {skippedCount > 0 && ` · ${skippedCount} skipped`}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 2 — Strength Progress
// ─────────────────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="text-slate-400 mb-0.5">{label}</p>
      <p className="font-semibold" style={{ color: NAVY }}>
        {payload[0]?.value?.toFixed(1)} kg e1RM
      </p>
    </div>
  )
}

function StrengthProgress({ flatSets }) {
  // Group sets by exercise name
  const byExercise = {}
  for (const s of flatSets) {
    if (!byExercise[s.exercise_name]) byExercise[s.exercise_name] = []
    byExercise[s.exercise_name].push(s)
  }

  // Build chart data for exercises appearing on 2+ dates
  const charts = []
  for (const [name, sets] of Object.entries(byExercise)) {
    // Max e1RM per date
    const byDate = {}
    for (const s of sets) {
      const orm = e1RM(s.weight_kg, s.reps)
      if (orm > 0 && (!byDate[s.date] || orm > byDate[s.date])) byDate[s.date] = orm
    }
    const dates = Object.keys(byDate).sort()
    if (dates.length < 2) continue

    const data  = dates.map(d => ({ date: fmtDateShort(d), e1RM: Math.round(byDate[d] * 10) / 10 }))
    const first = data[0].e1RM
    const best  = Math.max(...data.map(d => d.e1RM))
    const pct   = first > 0 ? ((best - first) / first) * 100 : 0
    charts.push({ name, data, first, best, pct, lastDate: dates[dates.length - 1] })
  }

  // Most recent first
  charts.sort((a, b) => b.lastDate.localeCompare(a.lastDate))

  return (
    <div className="mb-8">
      <SectionHeading>Strength Progress</SectionHeading>
      {charts.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          Strength progress charts will appear after you've logged the same exercise in more than one session.
        </p>
      ) : (
        <div className="space-y-4">
          {charts.map(({ name, data, first, best, pct }) => {
            const positive   = pct > 0
            const pctColor   = positive ? NAVY : '#9CA3AF'
            const pctDisplay = `${positive ? '+' : ''}${pct.toFixed(1)}%`
            return (
              <div key={name} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <p className="text-sm font-bold text-slate-800 mb-3">{name}</p>
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: '#9CA3AF' }}
                      axisLine={false}
                      tickLine={false}
                      width={42}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="e1RM"
                      stroke={NAVY}
                      strokeWidth={2}
                      dot={{ fill: NAVY, r: 3 }}
                      activeDot={{ r: 5, fill: NAVY }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <p className="text-xs text-slate-500 mt-2">
                  First session: {first.toFixed(1)}kg · Best: {best.toFixed(1)}kg ·{' '}
                  <span className="font-bold" style={{ color: pctColor }}>{pctDisplay}</span>
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 3 — Consistency Heatmap
// ─────────────────────────────────────────────────────────────────────────────

const LEGEND = [
  { bg: NAVY,                    border: null,      label: 'Completed' },
  { bg: '#DBEAFE',               border: '#BFDBFE', label: 'Planned'   },
  { bg: 'rgba(13,115,119,0.3)',  border: null,      label: 'Rest'      },
  { bg: 'white',                 border: '#E5E7EB', label: 'Future'    },
]

function ConsistencyHeatmap({ programme, programmeSessions, loggedDateSet, plannedDateSet }) {
  const programmeStart = getMondayOf(programme.created_at)
  const createdDay     = new Date(programme.created_at)
  createdDay.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Build 84 squares (12 weeks × 7 days)
  const squares = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(programmeStart)
    d.setDate(programmeStart.getDate() + i)
    const iso        = d.toISOString().slice(0, 10)
    const isFuture   = d > today
    const isPreStart = d < createdDay

    let bg, border = null
    if (isFuture || isPreStart) {
      bg = 'white'; border = '#E5E7EB'
    } else if (loggedDateSet.has(iso)) {
      bg = NAVY
    } else if (plannedDateSet.has(iso)) {
      bg = '#DBEAFE'; border = '#BFDBFE'
    } else {
      bg = 'rgba(13,115,119,0.3)'
    }
    return { iso, bg, border }
  })

  // Most consistent week — among weeks with ≥1 session planned
  let bestWeek = null
  for (let w = 1; w <= programme.total_weeks; w++) {
    const ws = programmeSessions.filter(s => s.week_number === w)
    if (!ws.length) continue
    const completed = ws.filter(s => s.status === 'complete').length
    const rate      = completed / ws.length
    if (!bestWeek || rate > bestWeek.rate || (rate === bestWeek.rate && completed > bestWeek.completed)) {
      bestWeek = { week: w, completed, total: ws.length, rate }
    }
  }

  return (
    <div className="mb-8">
      <SectionHeading>Consistency</SectionHeading>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        {/* Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 28px)', gap: 4 }}>
          {squares.map(({ iso, bg, border }) => (
            <div
              key={iso}
              title={iso}
              style={{
                width: 28,
                height: 28,
                borderRadius: 4,
                backgroundColor: bg,
                ...(border ? { border: `1px solid ${border}` } : {}),
              }}
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-4">
          {LEGEND.map(({ bg, border, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: bg,
                  flexShrink: 0,
                  ...(border ? { border: `1px solid ${border}` } : {}),
                }}
              />
              <span className="text-xs text-slate-400">{label}</span>
            </div>
          ))}
        </div>

        {/* Most consistent week */}
        {bestWeek && bestWeek.completed > 0 && (
          <p className="text-xs text-slate-500 mt-3">
            Most consistent week: Week {bestWeek.week} —{' '}
            <span className="font-medium">{bestWeek.completed} of {bestWeek.total} sessions completed.</span>
          </p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Section 4 — Personal Records
// ─────────────────────────────────────────────────────────────────────────────

function PersonalRecordsSection({ records }) {
  const now = Date.now()
  return (
    <div className="mb-8">
      <SectionHeading>Personal Records</SectionHeading>
      {records.length === 0 ? (
        <p className="text-xs text-slate-400 italic">
          Your personal records will appear here as you log sessions.
        </p>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          {records.map((r, i) => {
            const isNew = r.date && (now - new Date(r.date).getTime()) < 7 * 864e5
            return (
              <div key={i}>
                {i > 0 && <div className="h-px bg-slate-100 mx-4" />}
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800 capitalize">
                        {r.exercise_name}
                      </span>
                      {isNew && (
                        <span
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white flex-shrink-0"
                          style={{ backgroundColor: TEAL }}
                        >
                          NEW
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{fmtDate(r.date)}</p>
                  </div>
                  <span className="text-sm font-bold text-slate-800 flex-shrink-0 whitespace-nowrap">
                    {r.weight_kg}kg × {r.reps}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Session History (preserved from existing Progress screen)
// ─────────────────────────────────────────────────────────────────────────────

function SessionModal({ session, onClose }) {
  if (!session) return null
  const colorClass = SESSION_COLORS[session.session_type] ?? 'bg-gray-100 text-gray-700'
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 pb-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize mb-1 ${colorClass}`}>
              {sessionLabel(session)}
            </span>
            <p className="text-lg font-bold text-slate-800 leading-tight">
              {session.title || sessionLabel(session)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 mt-1"
          >
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M13.5 4.5L4.5 13.5M4.5 4.5l9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-xl py-3">
            <p className="text-base font-bold text-teal-600">{session.duration_mins ?? '—'}</p>
            <p className="text-xs text-gray-400 mt-0.5">mins</p>
          </div>
          <div className="bg-gray-50 rounded-xl py-3">
            <p className="text-base font-bold text-slate-700">{session.rpe ?? '—'}</p>
            <p className="text-xs text-gray-400 mt-0.5">RPE</p>
          </div>
          <div className="bg-gray-50 rounded-xl py-3">
            <p className="text-base font-bold text-slate-700 text-xs">{fmtDate(session.date)}</p>
            <p className="text-xs text-gray-400 mt-0.5">date</p>
          </div>
        </div>

        {session.notes && (
          <div className="bg-gray-50 rounded-xl px-4 py-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm text-gray-700 leading-relaxed">{session.notes}</p>
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full text-white font-semibold text-sm py-3 rounded-xl transition-colors"
          style={{ backgroundColor: NAVY }}
        >
          Close
        </button>
      </div>
    </div>
  )
}

function SessionHistory({ sessions }) {
  const [selected, setSelected] = useState(null)
  if (!sessions.length) return null

  return (
    <div className="mb-8">
      <SectionHeading>Session History</SectionHeading>
      <div className="space-y-2">
        {sessions.map(s => {
          const colorClass = SESSION_COLORS[s.session_type] ?? 'bg-gray-100 text-gray-700'
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3 hover:border-slate-300 hover:shadow-md transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize shrink-0 ${colorClass}`}>
                    {sessionLabel(s)}
                  </span>
                  <span className="text-xs text-gray-400 truncate">{fmtDate(s.date)}</span>
                </div>
                <p className="text-sm font-medium text-slate-700 truncate">
                  {s.title || sessionLabel(s)}
                </p>
              </div>
              <div className="text-right shrink-0 space-y-0.5">
                {s.duration_mins && <p className="text-xs text-gray-500">{s.duration_mins} min</p>}
                {s.rpe           && <p className="text-xs text-gray-400">RPE {s.rpe}</p>}
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-300 shrink-0">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )
        })}
      </div>
      <SessionModal session={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Badges (preserved from existing Progress screen)
// ─────────────────────────────────────────────────────────────────────────────

function BadgesSection({ earnedBadges }) {
  const earnedMap = {}
  for (const b of earnedBadges) earnedMap[b.badge_key] = b.date_earned
  const allKeys = Object.keys(BADGE_LABELS)
  return (
    <div className="mb-8">
      <SectionHeading>Badges</SectionHeading>
      <div className="grid grid-cols-3 gap-3">
        {allKeys.map((key, i) => {
          const isEarned = key in earnedMap
          const color    = BADGE_COLORS[i % BADGE_COLORS.length]
          return (
            <div
              key={key}
              className={`rounded-xl border p-3 text-center transition-all ${
                isEarned ? `${color} shadow-sm` : 'bg-gray-50 border-gray-100 opacity-40'
              }`}
            >
              <p className={`text-xs font-semibold leading-tight mb-1 ${isEarned ? '' : 'text-gray-400'}`}>
                {BADGE_LABELS[key]}
              </p>
              {isEarned && earnedMap[key]
                ? <p className="text-xs opacity-60">{fmtDate(earnedMap[key])}</p>
                : <p className="text-xs text-gray-300">Locked</p>
              }
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Wellbeing (preserved from existing Progress screen)
// ─────────────────────────────────────────────────────────────────────────────

function ScoreBar({ value, color }) {
  const pct = Math.round((value / 5) * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-slate-700 w-8 text-right">{value.toFixed(1)}</span>
    </div>
  )
}

function WellbeingSection({ wellbeingLogs, socialCount, bodyScanCount }) {
  if (wellbeingLogs.length < 3) return null
  const avg = key => {
    const vals = wellbeingLogs.filter(r => r[key] != null).map(r => r[key])
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }
  const avgMood   = avg('mood_score')
  const avgSleep  = avg('sleep_quality')
  const avgEnergy = avg('energy_score')
  return (
    <div className="mb-8">
      <SectionHeading>Wellbeing</SectionHeading>
      <div className="space-y-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Last 28 days — averages</p>
          {avgMood   !== null && <div><p className="text-sm font-medium text-slate-700 mb-1.5">Mood</p><ScoreBar value={avgMood}   color="bg-blue-400"   /></div>}
          {avgSleep  !== null && <div><p className="text-sm font-medium text-slate-700 mb-1.5">Sleep quality</p><ScoreBar value={avgSleep}  color="bg-violet-400" /></div>}
          {avgEnergy !== null && <div><p className="text-sm font-medium text-slate-700 mb-1.5">Energy</p><ScoreBar value={avgEnergy} color="bg-amber-400"  /></div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-3xl font-bold text-teal-600 mb-1">{socialCount}</p>
            <p className="text-xs text-gray-400 leading-tight">Social activities<br />this month</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
            <p className="text-3xl font-bold text-teal-600 mb-1">{bodyScanCount}</p>
            <p className="text-xs text-gray-400 leading-tight">Body scans<br />completed</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function Progress() {
  const { session } = useAuth()
  const navigate    = useNavigate()  // kept for potential future use
  const userId      = session.user.id

  const [loading,       setLoading]       = useState(true)
  const [programme,     setProgramme]     = useState(null)
  const [programmeSess, setProgrammeSess] = useState([])
  const [currentWeek,   setCurrentWeek]   = useState(1)
  const [flatSets,      setFlatSets]      = useState([])
  const [loggedDates,   setLoggedDates]   = useState(new Set())
  const [plannedDates,  setPlannedDates]  = useState(new Set())
  const [sessions,      setSessions]      = useState([])
  const [records,       setRecords]       = useState([])
  const [earnedBadges,  setEarnedBadges]  = useState([])
  const [wellbeingLogs, setWellbeingLogs] = useState([])
  const [socialCount,   setSocialCount]   = useState(0)
  const [bodyScanCount, setBodyScanCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const since28 = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)

      const [
        fullProgResult,
        sessHistResult,
        sessWithSetsResult,
        sessLoggedDatesResult,
        sessPlannedDatesResult,
        recordsResult,
        badgeResult,
        wbResult,
        socialResult,
        mindfulResult,
        mindfulLoggedResult,
      ] = await Promise.all([
        // 1. Programme + all programme_sessions
        getFullProgramme(userId),

        // 2. Session history for the history list (most recent first)
        supabase
          .from('sessions_logged')
          .select('id, date, session_type, practice_type, title, duration_mins, rpe, notes')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(200),

        // 3. Sessions with embedded exercise_sets for strength charts
        // FK: exercise_sets.session_logged_id → sessions_logged.id
        supabase
          .from('sessions_logged')
          .select('date, exercise_sets!session_logged_id(exercise_name, weight_kg, reps)')
          .eq('user_id', userId)
          .order('date', { ascending: true }),

        // 4. All logged dates for the consistency heatmap
        supabase
          .from('sessions_logged')
          .select('date')
          .eq('user_id', userId),

        // 5. All planned dates for the consistency heatmap
        supabase
          .from('sessions_planned')
          .select('date')
          .eq('user_id', userId),

        // 6. Personal records (date column is 'date', not 'date_achieved')
        supabase
          .from('personal_records')
          .select('exercise_name, weight_kg, reps, one_rep_max_kg, date')
          .eq('user_id', userId)
          .order('date', { ascending: false }),

        // 7. Badges
        supabase
          .from('badges')
          .select('badge_key, badge_label, date_earned')
          .eq('user_id', userId)
          .order('date_earned', { ascending: false }),

        // 8. Wellbeing (last 28 days)
        supabase
          .from('wellbeing_logs')
          .select('date, mood_score, energy_score, sleep_quality')
          .eq('user_id', userId)
          .gte('date', since28)
          .order('date', { ascending: false }),

        // 9. Social activity count (last 28 days)
        supabase
          .from('social_activity_logs')
          .select('id')
          .eq('user_id', userId)
          .gte('date', since28),

        // 10. Body scans — legacy mindfulness_logs table
        supabase
          .from('mindfulness_logs')
          .select('id')
          .eq('user_id', userId)
          .eq('completed', true)
          .gte('date', since28),

        // 11. Body scans — new sessions_logged table
        supabase
          .from('sessions_logged')
          .select('id')
          .eq('user_id', userId)
          .eq('session_type', 'mindfulness')
          .eq('practice_type', 'body_scan')
          .gte('date', since28),
      ])

      if (cancelled) return

      // ── Programme ────────────────────────────────────────────────────────
      const prog     = fullProgResult.data?.programme ?? null
      const progSess = fullProgResult.data?.sessions  ?? []
      setProgramme(prog)
      setProgrammeSess(progSess)
      if (prog) setCurrentWeek(calcCurrentWeek(prog.created_at, prog.total_weeks))

      // ── Exercise sets — flatten sessions_logged embed ────────────────────
      const flat = []
      for (const sess of sessWithSetsResult.data ?? []) {
        for (const s of sess.exercise_sets ?? []) {
          if (s.weight_kg > 0 && s.reps > 0 && s.exercise_name) {
            flat.push({ exercise_name: s.exercise_name, weight_kg: s.weight_kg, reps: s.reps, date: sess.date })
          }
        }
      }
      setFlatSets(flat)

      // ── Heatmap date sets ─────────────────────────────────────────────────
      setLoggedDates(new Set((sessLoggedDatesResult.data ?? []).map(r => r.date)))
      setPlannedDates(new Set((sessPlannedDatesResult.data ?? []).map(r => r.date)))

      // ── Remaining data ────────────────────────────────────────────────────
      setSessions(sessHistResult.data ?? [])
      setRecords(recordsResult.data ?? [])
      setEarnedBadges(badgeResult.data ?? [])
      setWellbeingLogs(wbResult.data ?? [])
      setSocialCount((socialResult.data ?? []).length)
      setBodyScanCount((mindfulResult.data ?? []).length + (mindfulLoggedResult.data ?? []).length)

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userId])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) return <Spinner />

  // ── Empty state — no programme, no history, no records ───────────────────
  if (!programme && !sessions.length && !records.length) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-6 pb-12">
        <h1 className="text-2xl font-bold mb-1" style={{ color: NAVY }}>Progress</h1>
        <div className="mt-20 flex flex-col items-center text-center gap-4">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold shadow-md"
            style={{ backgroundColor: NAVY }}
          >
            R
          </div>
          <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
            Your progress will appear here once Rex has built your programme and you've completed your first session.
          </p>
        </div>
      </main>
    )
  }

  // ── Main content ──────────────────────────────────────────────────────────
  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-12">
      <h1 className="text-2xl font-bold mb-6" style={{ color: NAVY }}>Progress</h1>

      {/* Section 1 — Programme Arc */}
      {programme ? (
        <ProgrammeArc
          programme={programme}
          programmeSessions={programmeSess}
          currentWeek={currentWeek}
        />
      ) : (
        <div className="mb-8 bg-slate-50 rounded-xl px-4 py-3">
          <p className="text-xs text-slate-400 italic">
            Programme arc will appear once Rex has built your plan.
          </p>
        </div>
      )}

      {/* Section 2 — Strength Progress */}
      <StrengthProgress flatSets={flatSets} />

      {/* Section 3 — Consistency Heatmap */}
      {programme && (
        <ConsistencyHeatmap
          programme={programme}
          programmeSessions={programmeSess}
          loggedDateSet={loggedDates}
          plannedDateSet={plannedDates}
        />
      )}

      {/* Section 4 — Personal Records */}
      <PersonalRecordsSection records={records} />

      {/* Session History */}
      <SessionHistory sessions={sessions} />

      {/* Badges */}
      <BadgesSection earnedBadges={earnedBadges} />

      {/* Wellbeing */}
      <WellbeingSection
        wellbeingLogs={wellbeingLogs}
        socialCount={socialCount}
        bodyScanCount={bodyScanCount}
      />
    </main>
  )
}
