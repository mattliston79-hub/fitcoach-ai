import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// ── Session type colour palette ────────────────────────────────────────────
const SESSION_COLORS = {
  kettlebell:      { dot: 'bg-amber-400',   card: 'bg-amber-50',   badge: 'bg-amber-400'   },
  hiit_bodyweight: { dot: 'bg-red-400',     card: 'bg-red-50',     badge: 'bg-red-400'     },
  yoga:            { dot: 'bg-violet-400',  card: 'bg-violet-50',  badge: 'bg-violet-400'  },
  pilates:         { dot: 'bg-pink-400',    card: 'bg-pink-50',    badge: 'bg-pink-400'    },
  plyometrics:     { dot: 'bg-orange-400',  card: 'bg-orange-50',  badge: 'bg-orange-400'  },
  coordination:    { dot: 'bg-blue-400',    card: 'bg-blue-50',    badge: 'bg-blue-400'    },
  flexibility:     { dot: 'bg-emerald-400', card: 'bg-emerald-50', badge: 'bg-emerald-400' },
  gym_strength:    { dot: 'bg-slate-500',   card: 'bg-slate-50',   badge: 'bg-slate-500'   },
}

const RECOVERY = {
  green:   { label: 'Ready to train',  cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  amber:   { label: 'Take it easy',    cls: 'bg-amber-100  text-amber-700  border-amber-200',  dot: 'bg-amber-500'  },
  red:     { label: 'Rest up',         cls: 'bg-red-100    text-red-700    border-red-200',    dot: 'bg-red-500'    },
  unknown: { label: 'Log recovery',    cls: 'bg-gray-100   text-gray-500   border-gray-200',   dot: 'bg-gray-400'   },
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Helpers ────────────────────────────────────────────────────────────────
function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function deriveRecovery(log) {
  if (!log) return 'unknown'
  if (log.soreness_score >= 4 || log.energy_score <= 2) return 'red'
  if (log.soreness_score === 3 || log.energy_score === 3) return 'amber'
  return 'green'
}

function calcStreak(logs) {
  if (!logs.length) return 0
  const unique = [...new Set(logs.map(l => l.date))].sort().reverse()
  const today = new Date().toISOString().slice(0, 10)
  let streak = 0
  let cursor = today
  for (const date of unique) {
    if (date === cursor) {
      streak++
      const d = new Date(cursor)
      d.setDate(d.getDate() - 1)
      cursor = d.toISOString().slice(0, 10)
    } else if (date < cursor) {
      break
    }
  }
  return streak
}

function getWeekDates() {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

// Sessions that use the timed HIIT logger rather than the set-based strength logger
const HIIT_TYPES = new Set(['hiit_bodyweight', 'plyometrics'])
const YOGA_TYPES = new Set(['yoga', 'pilates', 'flexibility'])
const loggerPath = (s) =>
  HIIT_TYPES.has(s.session_type) ? `/hiit/${s.id}` :
  YOGA_TYPES.has(s.session_type) ? `/yoga/${s.id}` :
  `/session/${s.id}`

// ── Sub-components ─────────────────────────────────────────────────────────
function TodayCard({ session, goalMap, navigate }) {
  if (!session) {
    return (
      <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100 text-center">
        <p className="text-sm text-gray-400">No session scheduled for today.</p>
      </div>
    )
  }
  const c = SESSION_COLORS[session.session_type] || { card: 'bg-gray-50', badge: 'bg-gray-400' }
  const label = session.session_type?.replace(/_/g, ' ') ?? 'session'
  const goalText = session.goal_id ? goalMap[session.goal_id] : null
  return (
    <div className={`${c.card} rounded-2xl p-5 border border-gray-100`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Today's Session</span>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full text-white ${c.badge} capitalize`}>
          {label}
        </span>
      </div>
      <h2 className="text-lg font-bold text-gray-800 mb-1 leading-tight">
        {session.title || 'Training Session'}
      </h2>
      {session.purpose_note && (
        <p className="text-sm text-gray-600 leading-relaxed mb-3">{session.purpose_note}</p>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        {session.duration_mins && (
          <p className="text-xs text-gray-400">⏱ {session.duration_mins} min</p>
        )}
        {goalText && (
          <span className="flex items-center gap-1 text-xs text-gray-500 bg-white/70 px-2 py-1 rounded-lg">
            <span>🎯</span>
            <span className="line-clamp-1 max-w-[180px]">{goalText}</span>
          </span>
        )}
      </div>
      <button
        onClick={() => navigate(loggerPath(session))}
        className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-bold py-3 rounded-xl transition-colors"
      >
        ▶  Start Session
      </button>
    </div>
  )
}

function WeeklyStrip({ weekDates, sessionByDate }) {
  const today = new Date().toISOString().slice(0, 10)
  const types = [...new Set(Object.values(sessionByDate).map(s => s.session_type))].filter(Boolean)

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">This Week</p>
      <div className="grid grid-cols-7 gap-1">
        {weekDates.map((date, i) => {
          const s = sessionByDate[date]
          const isToday = date === today
          const c = s ? (SESSION_COLORS[s.session_type] || { dot: 'bg-gray-300' }) : null
          const done = s?.status === 'completed'
          return (
            <div key={date} className="flex flex-col items-center gap-1.5">
              <span className={`text-xs ${isToday ? 'font-bold text-teal-600' : 'text-gray-400'}`}>
                {DAY_LABELS[i]}
              </span>
              <div className={[
                'w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                s ? `${c.dot} text-white ${done ? 'opacity-100' : 'opacity-60'}` : 'bg-gray-100 text-gray-300',
                isToday ? 'ring-2 ring-teal-500 ring-offset-1' : '',
              ].join(' ')}>
                {done ? '✓' : ''}
              </div>
            </div>
          )
        })}
      </div>
      {types.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {types.map(type => {
            const c = SESSION_COLORS[type]
            if (!c) return null
            return (
              <span key={type} className="flex items-center gap-1 text-xs text-gray-400 capitalize">
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                {type.replace(/_/g, ' ')}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function Dashboard() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userId = session.user.id

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    name: '',
    recoveryStatus: 'unknown',
    todaySession: null,
    weekSessions: [],
    streak: 0,
    latestBadge: null,
    goalMap: {},
  })

  useEffect(() => {
    let cancelled = false

    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const weekDates = getWeekDates()

      const [userRes, recoveryRes, todayRes, weekRes, loggedRes, badgeRes, goalsRes] = await Promise.all([
        supabase.from('users').select('name').eq('id', userId).single(),

        supabase
          .from('recovery_logs')
          .select('soreness_score, energy_score')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(1),

        supabase
          .from('sessions_planned')
          .select('id, title, session_type, duration_mins, purpose_note, goal_id')
          .eq('user_id', userId)
          .eq('date', today)
          .neq('status', 'completed')
          .limit(1),

        supabase
          .from('sessions_planned')
          .select('date, session_type, status')
          .eq('user_id', userId)
          .gte('date', weekDates[0])
          .lte('date', weekDates[6]),

        supabase
          .from('sessions_logged')
          .select('date')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(60),

        supabase
          .from('user_badges')
          .select('earned_at, badges(name, description, icon_emoji)')
          .eq('user_id', userId)
          .order('earned_at', { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from('goals')
          .select('id, goal_statement')
          .eq('user_id', userId),
      ])

      if (cancelled) return

      const goalMap = {}
      for (const g of goalsRes.data ?? []) goalMap[g.id] = g.goal_statement

      setData({
        name: userRes.data?.name || '',
        recoveryStatus: deriveRecovery(recoveryRes.data?.[0] ?? null),
        todaySession: todayRes.data?.[0] ?? null,
        weekSessions: weekRes.data ?? [],
        streak: calcStreak(loggedRes.data ?? []),
        latestBadge: badgeRes.error ? null : (badgeRes.data ?? null),
        goalMap,
      })
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userId])

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  const weekDates = getWeekDates()
  const today = new Date().toISOString().slice(0, 10)
  const recovery = RECOVERY[data.recoveryStatus]
  const firstName = data.name?.split(' ')[0] || ''

  // date → session map for the weekly strip
  const sessionByDate = {}
  data.weekSessions.forEach(s => { sessionByDate[s.date] = s })

  const streakEmoji = data.streak >= 7 ? '🔥' : data.streak >= 3 ? '⚡' : '💪'

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-10">

      {/* ── Greeting + Recovery badge ──────────────────────────── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">
            {getGreeting()}{firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {today === weekDates[0] ? "New week — let's go!" : "Here's your plan for today."}
          </p>
        </div>
        <span className={`mt-1 shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${recovery.cls}`}>
          <span className={`w-2 h-2 rounded-full ${recovery.dot}`} />
          {recovery.label}
        </span>
      </div>

      {/* ── Today's session ────────────────────────────────────── */}
      <TodayCard session={data.todaySession} goalMap={data.goalMap} navigate={navigate} />

      {/* ── Weekly strip ───────────────────────────────────────── */}
      <WeeklyStrip weekDates={weekDates} sessionByDate={sessionByDate} />

      {/* ── Streak + Latest badge ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-1 min-h-[100px]">
          <span className="text-3xl font-bold text-teal-600 leading-none">{data.streak}</span>
          <span className="text-sm text-gray-500">day streak</span>
          <span className="text-xl mt-1">{streakEmoji}</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-1 text-center min-h-[100px]">
          {data.latestBadge?.badges ? (
            <>
              <span className="text-3xl">{data.latestBadge.badges.icon_emoji || '🏅'}</span>
              <span className="text-xs font-semibold text-gray-700 leading-tight">
                {data.latestBadge.badges.name}
              </span>
              <span className="text-xs text-gray-400">Latest badge</span>
            </>
          ) : (
            <>
              <span className="text-3xl text-gray-200">🏅</span>
              <span className="text-xs text-gray-400 leading-tight">No badges yet</span>
              <span className="text-xs text-gray-300">Keep training!</span>
            </>
          )}
        </div>
      </div>

      {/* ── Talk to coaches ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={() => navigate('/chat/fitz')}
          className="flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold text-sm py-3.5 rounded-2xl transition-colors shadow-sm"
        >
          <span className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-xs font-bold shrink-0">F</span>
          Talk to Fitz
        </button>
        <button
          onClick={() => navigate('/chat/rex')}
          className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-semibold text-sm py-3.5 rounded-2xl transition-colors shadow-sm"
        >
          <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0">R</span>
          Talk to Rex
        </button>
      </div>

    </main>
  )
}
