import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// ── Session type colours ───────────────────────────────────────────────────
const SESSION_COLORS = {
  kettlebell:      { bg: 'bg-amber-100',   border: 'border-amber-300',   badge: 'bg-amber-400',   text: 'text-amber-800'   },
  hiit_bodyweight: { bg: 'bg-red-100',     border: 'border-red-300',     badge: 'bg-red-400',     text: 'text-red-800'     },
  yoga:            { bg: 'bg-violet-100',  border: 'border-violet-300',  badge: 'bg-violet-400',  text: 'text-violet-800'  },
  pilates:         { bg: 'bg-pink-100',    border: 'border-pink-300',    badge: 'bg-pink-400',    text: 'text-pink-800'    },
  plyometrics:     { bg: 'bg-orange-100',  border: 'border-orange-300',  badge: 'bg-orange-400',  text: 'text-orange-800'  },
  coordination:    { bg: 'bg-blue-100',    border: 'border-blue-300',    badge: 'bg-blue-400',    text: 'text-blue-800'    },
  flexibility:     { bg: 'bg-emerald-100', border: 'border-emerald-300', badge: 'bg-emerald-400', text: 'text-emerald-800' },
  gym_strength:    { bg: 'bg-slate-100',   border: 'border-slate-300',   badge: 'bg-slate-500',   text: 'text-slate-700'   },
}

const DEFAULT_COLOR = { bg: 'bg-gray-100', border: 'border-gray-300', badge: 'bg-gray-400', text: 'text-gray-700' }

const HIIT_TYPES = new Set(['hiit_bodyweight', 'plyometrics'])
const YOGA_TYPES = new Set(['yoga', 'pilates', 'flexibility'])
const loggerPath = (s) =>
  HIIT_TYPES.has(s.session_type) ? `/hiit/${s.id}` :
  YOGA_TYPES.has(s.session_type) ? `/yoga/${s.id}` :
  `/session/${s.id}`

const DAY_LABELS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ────────────────────────────────────────────────────────────────
function getWeekDates(offset = 0) {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

function formatWeekLabel(dates) {
  const start = new Date(dates[0])
  const end   = new Date(dates[6])
  const sm = MONTH_NAMES[start.getMonth()]
  const em = MONTH_NAMES[end.getMonth()]
  const sd = start.getDate()
  const ed = end.getDate()
  if (sm === em) return `${sm} ${sd}–${ed}, ${end.getFullYear()}`
  return `${sm} ${sd} – ${em} ${ed}, ${end.getFullYear()}`
}

function generateICS(sessions, goalMap) {
  const events = sessions.map(s => {
    const dateParts = s.date.replace(/-/g, '')
    const start = `${dateParts}T090000`
    const endMs = new Date(`${s.date}T09:00:00`)
    endMs.setMinutes(endMs.getMinutes() + (s.duration_mins || 45))
    const end = endMs.toISOString().replace(/[-:.]/g, '').slice(0, 15)

    const goalText = s.goal_id && goalMap[s.goal_id]
      ? `Goal: ${goalMap[s.goal_id]}`
      : null
    const desc = [s.purpose_note, goalText]
      .filter(Boolean)
      .join('\\n')
      .replace(/,/g, '\\,')

    return [
      'BEGIN:VEVENT',
      `UID:alongside-${s.id || s.date + s.session_type}@alongside.fit`,
      `DTSTART:${start}`,
      `DTEND:${end}`,
      `SUMMARY:${(s.title || s.session_type?.replace(/_/g, ' ') || 'Session').replace(/,/g, '\\,')}`,
      desc ? `DESCRIPTION:${desc}` : null,
      'END:VEVENT',
    ].filter(Boolean).join('\r\n')
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Alongside//alongside.fit//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

function downloadICS(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ── Session card ───────────────────────────────────────────────────────────
function SessionCard({ session, goalMap, onStart }) {
  const c = SESSION_COLORS[session.session_type] || DEFAULT_COLOR
  const goalText = session.goal_id ? goalMap[session.goal_id] : null
  const typeLabel = session.session_type?.replace(/_/g, ' ') ?? 'session'
  const isDone = session.status === 'completed'

  return (
    <div className={`rounded-xl border p-3 ${c.bg} ${c.border} ${isDone ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-1 mb-2">
        <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full text-white ${c.badge}`}>
          {typeLabel}
        </span>
        {isDone && (
          <span className="text-xs text-gray-500 font-medium shrink-0">✓ done</span>
        )}
      </div>

      <p className={`text-sm font-bold leading-tight mb-1 ${c.text}`}>
        {session.title || 'Training Session'}
      </p>

      {session.duration_mins && (
        <p className="text-xs text-gray-500 mb-1">⏱ {session.duration_mins} min</p>
      )}

      {session.purpose_note && (
        <p className="text-xs text-gray-600 leading-relaxed line-clamp-3 mb-2">
          {session.purpose_note}
        </p>
      )}

      {goalText && (
        <div className="flex items-start gap-1 mt-1 mb-2">
          <span className="text-xs text-gray-400 shrink-0">🎯</span>
          <span className="text-xs text-gray-500 leading-tight line-clamp-2">{goalText}</span>
        </div>
      )}

      {!isDone && (
        <button
          onClick={onStart}
          className="mt-2 w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold py-2 rounded-lg transition-colors"
        >
          ▶ Start
        </button>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function SessionPlanner() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const userId      = session.user.id

  const [weekOffset, setWeekOffset] = useState(0)
  const [loading, setLoading]       = useState(true)
  const [sessions, setSessions]     = useState([])
  const [goalMap, setGoalMap]       = useState({})   // id → goal_statement

  const weekDates = getWeekDates(weekOffset)
  const today     = new Date().toISOString().slice(0, 10)

  const load = useCallback(async () => {
    setLoading(true)
    const dates = getWeekDates(weekOffset)

    const [sessRes, goalsRes] = await Promise.all([
      supabase
        .from('sessions_planned')
        .select('id, date, session_type, title, duration_mins, purpose_note, goal_id, status')
        .eq('user_id', userId)
        .gte('date', dates[0])
        .lte('date', dates[6])
        .order('date', { ascending: true }),

      supabase
        .from('goals')
        .select('id, goal_statement')
        .eq('user_id', userId),
    ])

    const map = {}
    for (const g of goalsRes.data ?? []) map[g.id] = g.goal_statement
    setSessions(sessRes.data ?? [])
    setGoalMap(map)
    setLoading(false)
  }, [userId, weekOffset])

  useEffect(() => { load() }, [load])

  // Group sessions by date
  const byDate = {}
  sessions.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  })

  function handleExport() {
    const ics = generateICS(sessions, goalMap)
    const label = `${weekDates[0]}_${weekDates[6]}`
    downloadICS(ics, `alongside-plan-${label}.ics`)
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 pb-12">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Session Planner</h1>
          <p className="text-sm text-gray-400 mt-0.5">Your weekly training schedule</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExport}
            disabled={sessions.length === 0}
            className="flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-700 text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <span>📅</span> Export .ics
          </button>
          <button
            onClick={() => navigate('/chat/rex')}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold">R</span>
            Ask Rex to adjust my plan
          </button>
        </div>
      </div>

      {/* ── Week navigation ────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 bg-white rounded-2xl border border-gray-200 px-4 py-3 shadow-sm">
        <button
          onClick={() => setWeekOffset(o => o - 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Previous week"
        >
          ‹
        </button>

        <div className="text-center">
          <p className="text-sm font-semibold text-gray-800">{formatWeekLabel(weekDates)}</p>
          {weekOffset === 0 && (
            <p className="text-xs text-teal-600 font-medium">Current week</p>
          )}
          {weekOffset !== 0 && (
            <button
              onClick={() => setWeekOffset(0)}
              className="text-xs text-teal-600 hover:text-teal-700 font-medium"
            >
              Back to today
            </button>
          )}
        </div>

        <button
          onClick={() => setWeekOffset(o => o + 1)}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
          aria-label="Next week"
        >
          ›
        </button>
      </div>

      {/* ── Calendar grid — desktop (md+) ──────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Desktop: 7-column grid */}
          <div className="hidden md:grid grid-cols-7 gap-2">
            {weekDates.map((date, i) => {
              const daySessions = byDate[date] ?? []
              const isToday = date === today
              const isPast  = date < today

              return (
                <div key={date} className="flex flex-col gap-2 min-w-0">
                  {/* Day header */}
                  <div className={`text-center py-2 rounded-xl text-sm ${
                    isToday
                      ? 'bg-teal-600 text-white font-bold'
                      : isPast
                        ? 'text-gray-400 font-medium'
                        : 'text-gray-700 font-medium'
                  }`}>
                    <div className="text-xs uppercase tracking-wide opacity-75">{DAY_LABELS[i]}</div>
                    <div className="text-base font-bold leading-tight">
                      {new Date(date).getUTCDate()}
                    </div>
                  </div>

                  {/* Session cards */}
                  <div className="flex flex-col gap-2">
                    {daySessions.map(s => (
                      <SessionCard key={s.id} session={s} goalMap={goalMap} onStart={() => navigate(loggerPath(s))} />
                    ))}
                    {daySessions.length === 0 && (
                      <div className="h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
                        <span className="text-xs text-gray-300">Rest</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile: vertical list */}
          <div className="md:hidden space-y-3">
            {weekDates.map((date, i) => {
              const daySessions = byDate[date] ?? []
              const isToday = date === today
              const isPast  = date < today

              return (
                <div key={date}>
                  <div className={`flex items-center gap-2 mb-2 ${isPast && !isToday ? 'opacity-50' : ''}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      isToday ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {new Date(date).getUTCDate()}
                    </div>
                    <span className={`text-sm font-semibold ${isToday ? 'text-teal-600' : 'text-gray-700'}`}>
                      {DAY_LABELS[i]}
                    </span>
                    {isToday && (
                      <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-medium">Today</span>
                    )}
                  </div>

                  {daySessions.length > 0 ? (
                    <div className="pl-10 space-y-2">
                      {daySessions.map(s => (
                        <SessionCard key={s.id} session={s} goalMap={goalMap} />
                      ))}
                    </div>
                  ) : (
                    <div className="pl-10">
                      <p className="text-xs text-gray-300 py-1">Rest day</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Empty week state */}
          {sessions.length === 0 && (
            <div className="text-center py-16">
              <p className="text-gray-400 text-sm mb-3">No sessions planned for this week.</p>
              <button
                onClick={() => navigate('/chat/rex')}
                className="text-sm text-teal-600 font-medium hover:text-teal-700 underline"
              >
                Ask Rex to generate a plan →
              </button>
            </div>
          )}
        </>
      )}
    </main>
  )
}
