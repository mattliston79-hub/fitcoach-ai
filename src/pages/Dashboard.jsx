import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import OakTree from '../components/OakTree'

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
  mindfulness:     { dot: 'bg-teal-400',   card: 'bg-teal-50',   badge: 'bg-teal-500'    },
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

function calcStreak(sessions) {
  if (!sessions.length) return 0
  const byDate = {}
  for (const s of sessions) {
    if (!byDate[s.date]) byDate[s.date] = []
    byDate[s.date].push(s)
  }
  const doneDates = Object.entries(byDate)
    .filter(([, day]) => {
      if (day.length === 1) return day[0].status === 'complete'
      const priority = day.find(s => s.is_priority)
      if (priority) return priority.status === 'complete'
      return day.some(s => s.status === 'complete')
    })
    .map(([date]) => date)
    .sort()
    .reverse()
  if (!doneDates.length) return 0
  const today = new Date().toISOString().slice(0, 10)
  let streak = 0
  let cursor = today
  for (const date of doneDates) {
    if (date === cursor) {
      streak++
      const d = new Date(cursor); d.setDate(d.getDate() - 1)
      cursor = d.toISOString().slice(0, 10)
    } else if (date < cursor) {
      break
    }
  }
  return streak
}

function getTreeInsight(state) {
  if (!state) return 'Your oak journey starts here. Plant your acorn and begin.'
  const { physical_score: p, social_score: s, emotional_score: e } = state
  const lowest = Math.min(p, s, e)
  if (lowest === p) return 'Your tree is well-connected and emotionally grounded. It could do with more physical activity — even 20 minutes makes a difference.'
  if (lowest === s) return 'Your training is consistent and your mood is steady. Your tree is missing sunlight — when did you last do something with other people?'
  if (lowest === e) return 'You are active and well-connected. Your tree needs some emotional nourishment — how has your sleep and mood been this week?'
  const avg = (p + s + e) / 3
  if (avg > 65) return 'Your tree is growing in good balance. All three domains are being nourished. Keep going.'
  return 'Your tree is growing steadily. Keep logging your sessions, wellbeing, and social moments.'
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
  s.session_type === 'mindfulness'  ? `/mindfulness/${s.id}` :
  HIIT_TYPES.has(s.session_type)    ? `/hiit/${s.id}` :
  YOGA_TYPES.has(s.session_type)    ? `/yoga/${s.id}` :
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

function WeeklyStrip({ weekDates, sessionByDate, priorityByDate }) {
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
          const done = s?.status === 'complete'
          const priorityPending = priorityByDate?.[date] === true
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
              {priorityPending && (
                <span className="text-teal-400 text-xs leading-none">★</span>
              )}
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
  const [oakTreeState, setOakTreeState] = useState(null)
  const [showTreeInsight, setShowTreeInsight] = useState(false)
  const [recoveryStatus, setRecoveryStatus] = useState(null)
  const [wellbeingLoggedToday, setWellbeingLoggedToday] = useState(false)
  const [questionnaireDue, setQuestionnaireDue] = useState(false)
  const [questionnaireBannerDismissed, setQuestionnaireBannerDismissed] = useState(false)
  const [showStepModal, setShowStepModal] = useState(false)
  const [dashStepInput, setDashStepInput] = useState('')
  const [stepSaving, setStepSaving] = useState(false)
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

      const [userRes, recoveryRes, todayRes, weekRes, streakRes, badgeRes, goalsRes, wellbeingRes, qScheduleRes] = await Promise.all([
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
          .neq('status', 'complete')
          .limit(1),

        supabase
          .from('sessions_planned')
          .select('date, session_type, status, is_priority')
          .eq('user_id', userId)
          .gte('date', weekDates[0])
          .lte('date', weekDates[6]),

        supabase
          .from('sessions_planned')
          .select('date, status, is_priority')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(120),

        supabase
          .from('badges')
          .select('badge_key, badge_label, date_earned')
          .eq('user_id', userId)
          .order('date_earned', { ascending: false })
          .limit(1)
          .maybeSingle(),

        supabase
          .from('goals')
          .select('id, goal_statement')
          .eq('user_id', userId),

        supabase
          .from('wellbeing_logs')
          .select('id')
          .eq('user_id', userId)
          .eq('date', today)
          .limit(1),

        supabase
          .from('questionnaire_schedule')
          .select('next_due_at, reminder_dismissed_until')
          .eq('user_id', userId)
          .maybeSingle(),
      ])

      const { data: oakData } = await supabase
        .from('oak_tree_states')
        .select('growth_stage, physical_score, social_score, emotional_score')
        .eq('user_id', userId).maybeSingle()

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('recovery_status')
        .eq('user_id', userId).single()

      if (cancelled) return

      setOakTreeState(oakData ?? null)
      setRecoveryStatus(profile?.recovery_status ?? null)
      setWellbeingLoggedToday((wellbeingRes.data?.length ?? 0) > 0)

      // Check if questionnaire is due
      const qSched = qScheduleRes?.data
      if (!qSched) {
        setQuestionnaireDue(true)
      } else {
        const isDue = new Date(qSched.next_due_at) <= new Date()
        const snoozed = qSched.reminder_dismissed_until && new Date(qSched.reminder_dismissed_until) > new Date()
        setQuestionnaireDue(isDue && !snoozed)
      }

      const goalMap = {}
      for (const g of goalsRes.data ?? []) goalMap[g.id] = g.goal_statement

      setData({
        name: userRes.data?.name || '',
        recoveryStatus: deriveRecovery(recoveryRes.data?.[0] ?? null),
        todaySession: todayRes.data?.[0] ?? null,
        weekSessions: weekRes.data ?? [],
        streak: calcStreak(streakRes.data ?? []),
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

  // date → true (priority pending) | false (priority done) — only set when is_priority exists
  const priorityByDate = {}
  data.weekSessions.forEach(s => {
    if (s.is_priority) priorityByDate[s.date] = s.status !== 'complete'
  })

  const streakEmoji = data.streak >= 7 ? '🔥' : data.streak >= 3 ? '⚡' : '💪'

  const handleMoodSelect = async (mood) => {
    setRecoveryStatus(mood)
    await supabase.from('user_profiles').update({ recovery_status: mood }).eq('user_id', userId)
  }

  const dismissQuestionnaireBanner = async () => {
    setQuestionnaireBannerDismissed(true)
    const snoozedUntil = new Date()
    snoozedUntil.setDate(snoozedUntil.getDate() + 3)
    await supabase.from('questionnaire_schedule').upsert({
      user_id: userId,
      reminder_dismissed_until: snoozedUntil.toISOString(),
    }, { onConflict: 'user_id' })
  }

  const handleSaveSteps = async () => {
    const n = parseInt(dashStepInput, 10)
    if (!n || n <= 0) return
    setStepSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('daily_steps').upsert(
      { user_id: userId, date: today, steps: n },
      { onConflict: 'user_id,date' }
    )
    setDashStepInput('')
    setShowStepModal(false)
    setStepSaving(false)
  }

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
        {data.recoveryStatus === 'unknown' ? (
          <button
            onClick={() => navigate('/wellbeing')}
            className={`mt-1 shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${recovery.cls}`}
          >
            <span className={`w-2 h-2 rounded-full ${recovery.dot}`} />
            {recovery.label}
          </button>
        ) : (
          <span className={`mt-1 shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${recovery.cls}`}>
            <span className={`w-2 h-2 rounded-full ${recovery.dot}`} />
            {recovery.label}
          </span>
        )}
      </div>

      {/* ── Quick mood check-in ─────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 shrink-0">How are you feeling?</span>
        {[
          { key: 'green', label: 'Feeling good', dot: 'bg-emerald-500', active: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
          { key: 'amber', label: 'OK',           dot: 'bg-amber-400',   active: 'bg-amber-100 text-amber-700 border-amber-300' },
          { key: 'red',   label: 'Struggling',   dot: 'bg-red-400',     active: 'bg-red-100 text-red-700 border-red-300' },
        ].map(({ key, label, dot, active }) => (
          <button
            key={key}
            onClick={() => handleMoodSelect(key)}
            className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
              recoveryStatus === key
                ? active
                : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${dot}`} />
            {label}
          </button>
        ))}
      </div>

      {/* ── Questionnaire due banner ───────────────────────────── */}
      {questionnaireDue && !questionnaireBannerDismissed && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-800">Time for your wellbeing check-in</p>
            <p className="text-xs text-teal-500 mt-0.5">Takes about 5–10 minutes — helps Fitz support you better</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={dismissQuestionnaireBanner}
              className="text-xs text-teal-400 hover:text-teal-600 transition-colors"
            >
              Later
            </button>
            <button
              onClick={() => navigate('/my-data')}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-3 py-1.5 rounded-xl transition-colors"
            >
              Start →
            </button>
          </div>
        </div>
      )}

      {/* ── Today's session ────────────────────────────────────── */}
      <TodayCard session={data.todaySession} goalMap={data.goalMap} navigate={navigate} />

      {/* ── Weekly strip ───────────────────────────────────────── */}
      <WeeklyStrip weekDates={weekDates} sessionByDate={sessionByDate} priorityByDate={priorityByDate} />

      {/* ── Step count quick-entry ─────────────────────────────── */}
      <button
        onClick={() => setShowStepModal(true)}
        className="w-full text-left bg-white rounded-2xl px-5 py-3 border border-gray-100 shadow-sm flex items-center justify-between hover:border-teal-200 hover:shadow-md transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">👟</span>
          <span className="text-sm font-medium text-gray-700">Log today's steps</span>
        </div>
        <svg className="text-gray-300" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* ── Streak + Latest badge ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-1 min-h-[100px]">
          <span className="text-3xl font-bold text-teal-600 leading-none">{data.streak}</span>
          <span className="text-sm text-gray-500">day streak</span>
          <span className="text-xl mt-1">{streakEmoji}</span>
        </div>

        <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm flex flex-col items-center justify-center gap-1 text-center min-h-[100px]">
          {data.latestBadge?.badge_key ? (
            <>
              <span className="text-3xl">🏅</span>
              <span className="text-xs font-semibold text-gray-700 leading-tight text-center">
                {data.latestBadge.badge_label}
              </span>
              <button
                onClick={() => navigate('/progress')}
                className="text-xs text-teal-600 font-medium hover:underline mt-1"
              >
                View all →
              </button>
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

      {/* ── Oak Tree ───────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
        <div onClick={() => setShowTreeInsight(prev => !prev)} style={{ cursor: 'pointer' }}>
          <OakTree
            growthStage={oakTreeState?.growth_stage ?? 1}
            physicalScore={oakTreeState?.physical_score ?? 0}
            socialScore={oakTreeState?.social_score ?? 0}
            emotionalScore={oakTreeState?.emotional_score ?? 0}
          />
        </div>
      </div>
      {showTreeInsight && (
        <div className="mx-4 mt-2 p-4 bg-teal-50 border border-teal-100 rounded-xl text-sm text-teal-800">
          {getTreeInsight(oakTreeState)}
        </div>
      )}

      {/* ── Nourish your tree ──────────────────────────────────── */}
      <div className="bg-teal-50 rounded-2xl px-5 py-4 border border-teal-100 flex items-center justify-between">
        <p className="text-xs text-teal-400 font-medium">Nourish your tree</p>
        {wellbeingLoggedToday ? (
          <span className="text-sm font-semibold text-teal-500">✓ Logged today</span>
        ) : (
          <button
            onClick={() => navigate('/wellbeing')}
            className="text-sm font-semibold text-teal-700 hover:text-teal-900 transition-colors"
          >
            Log today's wellbeing →
          </button>
        )}
      </div>

      {/* ── Goals tile ─────────────────────────────────────────── */}
      <button
        onClick={() => navigate('/goals')}
        className="w-full text-left bg-white rounded-2xl px-5 py-4 border border-gray-100 shadow-sm flex items-center justify-between hover:border-teal-200 hover:shadow-md transition-all"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">🎯</span>
          <div>
            <p className="text-sm font-semibold text-gray-800">My Goals</p>
            <p className="text-xs text-gray-400 mt-0.5">View and manage your goals</p>
          </div>
        </div>
        <svg
          className="text-gray-300 flex-shrink-0"
          width="16" height="16" fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* ── Talk to coaches ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button
          onClick={() => navigate('/chat/fitz')}
          className="flex flex-col items-center justify-center gap-0.5 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white py-3.5 rounded-2xl transition-colors shadow-sm"
        >
          <span className="flex items-center gap-2 font-semibold text-sm">
            <span className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center text-xs font-bold shrink-0">F</span>
            Talk to Fitz
          </span>
          <span className="text-xs text-teal-200 font-normal">Your health &amp; wellbeing coach</span>
        </button>
        <button
          onClick={() => navigate('/chat/rex')}
          className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 active:bg-slate-950 text-white font-semibold text-sm py-3.5 rounded-2xl transition-colors shadow-sm"
        >
          <span className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold shrink-0">R</span>
          Talk to Rex
        </button>
      </div>

      {/* ── Step count modal ───────────────────────────────────── */}
      {showStepModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center p-4" onClick={() => setShowStepModal(false)}>
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-800">Log today's steps</h3>
            <input
              type="number"
              placeholder="e.g. 8500"
              value={dashStepInput}
              onChange={e => setDashStepInput(e.target.value)}
              autoFocus
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-2xl text-center font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowStepModal(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm text-gray-500 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSteps}
                disabled={!dashStepInput || stepSaving}
                className="flex-1 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-40"
              >
                {stepSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  )
}
