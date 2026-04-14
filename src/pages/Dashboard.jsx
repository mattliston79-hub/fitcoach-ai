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
    <div className={`${c.card} rounded-[1.5rem] p-6 border border-teal-100/50 shadow-premium-sm transition-all hover:shadow-premium`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold text-teal-800 uppercase tracking-widest">Today's Session</span>
        <span className={`text-[11px] font-bold px-3 py-1 rounded-full text-white ${c.badge} uppercase tracking-wider`}>
          {label}
        </span>
      </div>
      <h2 className="font-serif text-2xl font-bold text-teal-900 mb-2 leading-tight">
        {session.title || 'Training Session'}
      </h2>
      {session.purpose_note && (
        <p className="text-sm text-teal-800/80 leading-relaxed mb-4">{session.purpose_note}</p>
      )}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-6">
        {session.duration_mins && (
          <p className="text-sm text-teal-700/70 font-medium">⏱ {session.duration_mins} min</p>
        )}
        {goalText && (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-teal-800 uppercase tracking-widest bg-white/80 px-2.5 py-1.5 rounded-lg border border-teal-100/50">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
            <span className="line-clamp-1 max-w-[180px]">{goalText}</span>
          </span>
        )}
      </div>
      <button
        onClick={() => navigate(loggerPath(session))}
        className="w-full bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white text-sm font-semibold py-3.5 rounded-[1.25rem] transition-all shadow-sm hover:shadow active:scale-[0.98]"
      >
        Start Session
      </button>
    </div>
  )
}

function WeeklyStrip({ weekDates, sessionByDate, priorityByDate }) {
  const today = new Date().toISOString().slice(0, 10)
  const types = [...new Set(Object.values(sessionByDate).map(s => s.session_type))].filter(Boolean)

  return (
    <div className="bg-white rounded-[1.5rem] p-5 border border-teal-100/30 shadow-premium-sm">
      <p className="text-xs font-semibold text-teal-700/60 uppercase tracking-wide mb-4">This Week</p>
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
  const [wellbeingLoggedToday, setWellbeingLoggedToday] = useState(false)
  const [questionnaireDue, setQuestionnaireDue] = useState(false)
  const [questionnaireBannerDismissed, setQuestionnaireBannerDismissed] = useState(false)
  const [showStepModal, setShowStepModal] = useState(false)
  const [dashStepInput, setDashStepInput] = useState('')
  const [stepDateInput, setStepDateInput] = useState(() => new Date().toISOString().slice(0, 10))
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
    const logDate = stepDateInput || new Date().toISOString().slice(0, 10)
    await supabase.from('daily_steps').upsert(
      { user_id: userId, date: logDate, step_count: n },
      { onConflict: 'user_id,date' }
    )
    setDashStepInput('')
    setStepDateInput(new Date().toISOString().slice(0, 10))
    setShowStepModal(false)
    setStepSaving(false)
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-10">

      {/* ── Header: Greeting & Recovery ─────────────────────────────── */}
      <div className="flex flex-col gap-4 mt-2 mb-2">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl sm:text-4xl text-teal-900 tracking-tight leading-tight">
              {getGreeting()}{firstName ? `, ${firstName}` : ''}.
            </h1>
            <p className="text-sm text-teal-700/70 mt-1 font-medium">
              {today === weekDates[0] ? "New week — let's go!" : "Here's your plan for today."}
            </p>
          </div>
          {data.recoveryStatus !== 'unknown' && (
            <span className={`mt-1 shrink-0 inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border ${recovery.cls}`}>
              <span className={`w-2 h-2 rounded-full ${recovery.dot}`} />
              {recovery.label}
            </span>
          )}
        </div>
      </div>

      {/* ── Talk to coaches ────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 pb-2">
        <button
          onClick={() => navigate('/chat/fitz')}
          className="group relative flex flex-col items-start justify-center gap-1 bg-[#2C3B35] hover:bg-[#202c27] active:bg-[#161f1c] text-white py-5 px-5 rounded-[1.5rem] transition-all shadow-premium-sm hover:shadow-premium overflow-hidden border border-[#3e5048]"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-teal-800/40 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
          <span className="relative font-serif font-medium text-lg leading-none tracking-wide text-teal-50">
            Fitz
          </span>
          <span className="relative text-[10px] text-teal-200/60 font-semibold uppercase tracking-widest mt-1">Wellbeing</span>
        </button>
        <button
          onClick={() => navigate('/chat/rex')}
          className="group relative flex flex-col items-start justify-center gap-1 bg-[#3A3532] hover:bg-[#2D2927] active:bg-[#1A1817] text-white py-5 px-5 rounded-[1.5rem] transition-all shadow-premium-sm hover:shadow-premium overflow-hidden border border-[#4d4845]"
        >
          <div className="absolute inset-0 bg-[linear-gradient(135deg,_var(--tw-gradient-stops))] from-stone-600/20 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />
          <span className="relative font-serif font-medium text-lg leading-none tracking-wide text-stone-100">
            Rex
          </span>
          <span className="relative text-[10px] text-stone-300/50 font-semibold uppercase tracking-widest mt-1">Fitness</span>
        </button>
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

      {/* ── Oak Tree ───────────────────────────────────────────── */}
      <div className="bg-white rounded-[1.5rem] p-6 border border-teal-100/30 shadow-premium-sm transition-shadow hover:shadow-premium mt-4">
        <div onClick={() => setShowTreeInsight(prev => !prev)} className="cursor-pointer">
          <OakTree
            growthStage={oakTreeState?.growth_stage ?? 1}
            physicalScore={oakTreeState?.physical_score ?? 0}
            socialScore={oakTreeState?.social_score ?? 0}
            emotionalScore={oakTreeState?.emotional_score ?? 0}
          />
        </div>
      </div>
      {showTreeInsight && (
        <div className="mx-2 mt-3 p-5 bg-teal-50/80 border border-teal-200/50 rounded-2xl text-sm text-teal-900 font-medium leading-relaxed animate-fade-in shadow-inner">
          {getTreeInsight(oakTreeState)}
        </div>
      )}

      {/* ── Nourish your tree ──────────────────────────────────── */}
      <div className="bg-teal-50/60 rounded-[1.25rem] px-6 py-5 border border-teal-100 flex items-center justify-between mt-4">
        <p className="text-sm text-teal-800 font-serif font-semibold">Nourish your tree</p>
        {wellbeingLoggedToday ? (
          <span className="text-xs font-bold tracking-wide uppercase text-teal-600 bg-white/50 px-3 py-1.5 rounded-full">✓ Logged</span>
        ) : (
          <button
            onClick={() => navigate('/wellbeing')}
            className="text-xs font-bold text-teal-800 hover:text-teal-950 transition-colors uppercase tracking-widest flex items-center gap-1"
          >
            Log wellbeing <span className="text-teal-600">→</span>
          </button>
        )}
      </div>

      {/* ── Weekly strip ───────────────────────────────────────── */}
      <WeeklyStrip weekDates={weekDates} sessionByDate={sessionByDate} priorityByDate={priorityByDate} />

      {/* ── Log actions (Steps & Activity) ─────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mt-2">
        <button
          onClick={() => setShowStepModal(true)}
          className="relative w-full text-left bg-white rounded-[1.5rem] p-6 border border-teal-100/30 shadow-premium-sm flex flex-col justify-center hover:border-teal-200 hover:shadow-premium transition-all overflow-hidden h-[120px]"
        >
          <span className="absolute -right-2 -top-6 font-serif text-[100px] font-bold text-teal-50 leading-none select-none italic">S</span>
          <div className="relative mb-2">
            <span className="text-[18px] font-serif font-medium text-teal-900 leading-none">Steps</span>
          </div>
          <span className="relative text-[10px] text-teal-600/70 font-semibold uppercase tracking-widest">Log count</span>
        </button>

        <button
          onClick={() => navigate('/activity')}
          className="relative w-full text-left bg-white rounded-[1.5rem] p-6 border border-teal-100/30 shadow-premium-sm flex flex-col justify-center hover:border-teal-200 hover:shadow-premium transition-all overflow-hidden h-[120px]"
        >
          <span className="absolute -right-2 -bottom-6 font-serif text-[100px] font-bold text-teal-50 leading-none select-none italic">A</span>
          <div className="relative mb-2">
            <span className="text-[18px] font-serif font-medium text-teal-900 leading-none">Activity</span>
          </div>
          <span className="relative text-[10px] text-teal-600/70 font-semibold uppercase tracking-widest">Log session</span>
        </button>
      </div>

      {/* ── Streak + Latest badge ──────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="relative bg-white rounded-[1.5rem] p-5 border border-teal-100/30 shadow-premium-sm flex flex-col items-center justify-center min-h-[140px] hover:shadow-premium transition-shadow overflow-hidden">
          <span className="absolute inset-0 flex items-center justify-center font-serif text-[140px] font-bold text-[#F3F1EA] leading-none select-none translate-y-2">{data.streak}</span>
          <span className="relative font-serif text-[56px] font-medium text-teal-900 leading-none tracking-tight mb-2">{data.streak}</span>
          <span className="relative text-[10px] text-teal-700/60 uppercase tracking-widest font-semibold drop-shadow-sm">Day streak</span>
        </div>

        <div className="relative bg-white rounded-[1.5rem] p-5 border border-teal-100/30 shadow-premium-sm flex flex-col items-center justify-center text-center min-h-[140px] hover:shadow-premium transition-shadow overflow-hidden">
          {data.latestBadge?.badge_key ? (
            <>
              <div className="relative flex items-center justify-center w-[46px] h-[46px] rounded-full border border-teal-200 bg-teal-50 mb-3 shadow-inner">
                 <span className="font-serif text-[22px] font-medium text-teal-800">{data.latestBadge.badge_label.charAt(0)}</span>
              </div>
              <span className="text-[12px] font-medium text-teal-900 leading-tight text-center px-1">
                {data.latestBadge.badge_label}
              </span>
              <button
                onClick={() => navigate('/progress')}
                className="text-[9px] text-teal-500 font-bold hover:text-teal-800 tracking-widest uppercase mt-2 transition-colors"
              >
                View all
              </button>
            </>
          ) : (
            <>
              <div className="relative flex items-center justify-center w-[46px] h-[46px] rounded-full border border-gray-100 bg-[#F3F1EA]/50 mb-3 shadow-inner">
                 <span className="w-4 h-px bg-gray-300" />
              </div>
              <span className="text-[11px] text-gray-500 font-medium">No badges yet</span>
              <span className="text-[9px] text-gray-400 uppercase tracking-widest mt-1">Keep growing</span>
            </>
          )}
        </div>
      </div>



      {/* ── Goals tile ─────────────────────────────────────────── */}
      <button
        onClick={() => navigate('/goals')}
        className="w-full relative text-left bg-teal-900/5 rounded-[1.5rem] p-6 border border-teal-900/10 shadow-inner flex items-center justify-between hover:border-teal-900/20 hover:bg-teal-900/10 transition-all mb-4 overflow-hidden"
      >
        <span className="absolute -left-4 -bottom-8 font-serif text-[120px] font-bold text-teal-900/5 leading-none select-none">G</span>
        <div className="relative flex items-center gap-5 z-10 pl-2">
          <div className="flex flex-col gap-1">
            <p className="text-[19px] font-serif font-medium text-teal-950 leading-none tracking-tight">Your Goals</p>
            <p className="text-[10px] tracking-widest font-semibold text-teal-800/60 uppercase">View existing plan</p>
          </div>
        </div>
        <div className="relative z-10 w-9 h-9 rounded-full border border-teal-900/20 flex items-center justify-center bg-white/60 text-teal-900 shadow-sm transition-transform group-hover:scale-105">
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>



      {/* ── Step count modal ───────────────────────────────────── */}
      {showStepModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end justify-center p-4" onClick={() => setShowStepModal(false)}>
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-800">Log steps</h3>
            </div>
            
            <input
              type="date"
              value={stepDateInput}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => setStepDateInput(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 text-gray-700 bg-gray-50"
            />
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
