import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceLine, ResponsiveContainer, Cell,
} from 'recharts'
import { PERMA_DOMAIN_LABELS, scorePerma, scoreIpaq } from '../data/questionnaireData'
import QuestionnaireFlow from '../components/QuestionnaireFlow'

// ── UK CMO 2019 guidelines ─────────────────────────────────────────────────
function getCmoGuideline(age, gender) {
  const a = parseInt(age || 30, 10)
  if (a < 5)   return null
  if (a < 18)  return { mins: 60,  label: 'Children & young people: 60 min/day moderate-equivalent' }
  if (a <= 64) return { mins: 150, label: 'Adults 19–64: 150 min/week moderate-equivalent' }
  return        { mins: 150, label: 'Adults 65+: 150 min/week moderate-equivalent' }
}

const PERMA_DOMAINS = ['P', 'E', 'R', 'M', 'A', 'N', 'H', 'Lon', 'hap', 'overall']

const DOMAIN_COLOR = {
  P: '#14b8a6', E: '#6366f1', R: '#f59e0b', M: '#10b981',
  A: '#3b82f6', N: '#ef4444', H: '#84cc16', Lon: '#8b5cf6',
  hap: '#f97316', overall: '#0d9488',
}

// ── Main component ──────────────────────────────────────────────────────────
export default function MyData() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userId = session?.user?.id

  const [loading, setLoading] = useState(true)
  const [showQFlow, setShowQFlow] = useState(false)
  const [activeDomain, setActiveDomain] = useState('overall')

  const [profile, setProfile] = useState(null)
  const [permaHistory, setPermaHistory] = useState([])  // [{completed_at, score_summary}]
  const [ipaqHistory, setIpaqHistory] = useState([])
  const [steps, setSteps] = useState([])
  const [activityMins, setActivityMins] = useState([])  // weekly totals
  const [schedule, setSchedule] = useState(null)

  // Step entry
  const [stepInput, setStepInput] = useState('')
  const [stepSaving, setStepSaving] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false

    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const sevenDaysAgo = new Date(); sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
      const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 180)

      const [profileRes, permaRes, ipaqRes, stepsRes, activityRes, scheduleRes] = await Promise.all([
        supabase.from('user_profiles').select('age, gender').eq('user_id', userId).single(),
        supabase.from('questionnaire_responses')
          .select('completed_at, score_summary')
          .eq('user_id', userId)
          .eq('questionnaire_type', 'perma')
          .order('completed_at', { ascending: false })
          .limit(10),
        supabase.from('questionnaire_responses')
          .select('completed_at, score_summary')
          .eq('user_id', userId)
          .eq('questionnaire_type', 'ipaq')
          .order('completed_at', { ascending: false })
          .limit(10),
        supabase.from('daily_steps')
          .select('date, steps')
          .eq('user_id', userId)
          .gte('date', sevenDaysAgo.toISOString().slice(0, 10))
          .order('date', { ascending: true }),
        supabase.from('sessions_logged')
          .select('date, session_type, duration_mins')
          .eq('user_id', userId)
          .gte('date', thirtyDaysAgo.toISOString().slice(0, 10))
          .order('date', { ascending: true }),
        supabase.from('questionnaire_schedule')
          .select('next_due_at, last_completed_at')
          .eq('user_id', userId)
          .maybeSingle(),
      ])

      if (cancelled) return

      setProfile(profileRes.data ?? null)
      setPermaHistory(permaRes.data ?? [])
      setIpaqHistory(ipaqRes.data ?? [])
      setSteps(stepsRes.data ?? [])
      setSchedule(scheduleRes.data ?? null)

      // Aggregate activity mins per week (last 26 weeks)
      const weekMap = {}
      for (const s of (activityRes.data ?? [])) {
        const d = new Date(s.date)
        const monday = new Date(d)
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        const wk = monday.toISOString().slice(0, 10)
        if (!weekMap[wk]) weekMap[wk] = 0
        weekMap[wk] += (s.duration_mins || 0)
      }
      const weeks = Object.entries(weekMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([wk, mins]) => ({ week: wk, mins }))
      setActivityMins(weeks)

      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [userId])

  const handleSaveSteps = async () => {
    const n = parseInt(stepInput, 10)
    if (!n || n <= 0) return
    setStepSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('daily_steps').upsert({ user_id: userId, date: today, steps: n }, { onConflict: 'user_id,date' })
    const { data } = await supabase.from('daily_steps')
      .select('date, steps').eq('user_id', userId)
      .gte('date', (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10) })())
      .order('date', { ascending: true })
    setSteps(data ?? [])
    setStepInput('')
    setStepSaving(false)
  }

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  const cmo = getCmoGuideline(profile?.age, profile?.gender)
  const latestPerma = permaHistory[0]?.score_summary ?? null
  const latestIpaq  = ipaqHistory[0]?.score_summary ?? null
  const isDue = !schedule || new Date(schedule.next_due_at) <= new Date()

  // Build PERMA bar data for latest scores
  const permaBarData = PERMA_DOMAINS.filter(d => d !== 'overall').map(d => ({
    domain: PERMA_DOMAIN_LABELS[d] ?? d,
    score: latestPerma?.[d] ?? null,
    key: d,
  }))

  // Build PERMA trend data for selected domain
  const permaTrendData = [...permaHistory].reverse().map(r => ({
    date: r.completed_at?.slice(0, 10),
    score: r.score_summary?.[activeDomain] ?? null,
  })).filter(r => r.score !== null)

  // Build IPAQ trend
  const ipaqTrendData = [...ipaqHistory].reverse().map(r => ({
    date: r.completed_at?.slice(0, 10),
    mins: r.score_summary?.moderate_equiv_mins_per_week ?? null,
  })).filter(r => r.mins !== null)

  // This week activity mins
  const thisWeekStart = (() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10)
  })()
  const thisWeekMins = activityMins.find(w => w.week === thisWeekStart)?.mins ?? 0
  const cmoTarget = cmo?.mins ?? 150
  const cmoPct = Math.min(100, Math.round((thisWeekMins / cmoTarget) * 100))

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 space-y-5 pb-12">

      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600 text-sm">← Back</button>
        <h1 className="text-xl font-bold text-gray-800">My Data</h1>
      </div>

      {/* Questionnaire due banner */}
      {isDue && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-teal-800">
              {schedule ? 'Time for your 4-week check-in' : 'Complete your first wellbeing check-in'}
            </p>
            <p className="text-xs text-teal-500 mt-0.5">Takes about 5–10 minutes</p>
          </div>
          <button
            onClick={() => setShowQFlow(true)}
            className="shrink-0 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            Start →
          </button>
        </div>
      )}

      {/* ── Weekly activity progress ──────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">This Week's Activity</p>
        <div className="flex items-end justify-between">
          <span className="text-3xl font-bold text-teal-600">{thisWeekMins}</span>
          <span className="text-sm text-gray-400">/ {cmoTarget} min target</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${cmoPct >= 100 ? 'bg-teal-500' : 'bg-amber-400'}`}
            style={{ width: `${cmoPct}%` }}
          />
        </div>
        <p className={`text-xs font-medium ${cmoPct >= 100 ? 'text-teal-600' : 'text-amber-600'}`}>
          {cmoPct >= 100 ? '✓ Guideline met' : `${cmoTarget - thisWeekMins} min below guideline`}
        </p>
        {cmo && <p className="text-xs text-gray-400">{cmo.label}</p>}
      </div>

      {/* ── IPAQ trend ────────────────────────────────────────── */}
      {ipaqTrendData.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Physical Activity Trend (IPAQ)</p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={ipaqTrendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip
                formatter={(v) => [`${v} min`, 'Moderate-equiv mins/week']}
                labelStyle={{ fontSize: 11 }}
              />
              {cmo && (
                <ReferenceLine y={cmo.mins} stroke="#f59e0b" strokeDasharray="4 4"
                  label={{ value: 'CMO target', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
                />
              )}
              <Line type="monotone" dataKey="mins" stroke="#14b8a6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-400">Moderate-equivalent minutes per week (vigorous counts double)</p>
        </div>
      )}

      {/* ── Daily steps ───────────────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Daily Steps (last 7 days)</p>
          <span className="text-xs text-gray-400">10,000 step target</span>
        </div>

        {steps.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={steps} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [`${v.toLocaleString()}`, 'Steps']} labelStyle={{ fontSize: 11 }} />
              <ReferenceLine y={10000} stroke="#f59e0b" strokeDasharray="4 4" />
              <Bar dataKey="steps" radius={[4, 4, 0, 0]}>
                {steps.map((entry) => (
                  <Cell key={entry.date} fill={entry.steps >= 10000 ? '#14b8a6' : '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-gray-400 text-center py-4">No step data yet</p>
        )}

        {/* Log today */}
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="Log today's steps"
            value={stepInput}
            onChange={e => setStepInput(e.target.value)}
            className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <button
            onClick={handleSaveSteps}
            disabled={!stepInput || stepSaving}
            className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
          >
            {stepSaving ? '…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── PERMA latest scores ───────────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Wellbeing Scores (PERMA)</p>
          {latestPerma && (
            <span className="text-xs text-gray-400">
              {permaHistory[0]?.completed_at?.slice(0, 10)}
            </span>
          )}
        </div>

        {latestPerma ? (
          <>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={permaBarData.filter(d => d.score !== null)}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 4, bottom: 0 }}
              >
                <XAxis type="number" domain={[0, 10]} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="domain" tick={{ fontSize: 10 }} width={90} />
                <Tooltip formatter={(v) => [v?.toFixed(1), 'Score']} />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {permaBarData.filter(d => d.score !== null).map((entry) => (
                    <Cell key={entry.key} fill={DOMAIN_COLOR[entry.key] ?? '#14b8a6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Overall score */}
            <div className="flex items-center justify-between bg-teal-50 rounded-xl px-4 py-3">
              <span className="text-sm font-semibold text-teal-800">Overall Wellbeing</span>
              <span className="text-2xl font-bold text-teal-600">{latestPerma.overall?.toFixed(1)}</span>
            </div>
          </>
        ) : (
          <div className="text-center py-6 space-y-2">
            <p className="text-sm text-gray-400">No wellbeing data yet</p>
            <button
              onClick={() => setShowQFlow(true)}
              className="text-sm font-semibold text-teal-600 hover:underline"
            >
              Complete your first check-in →
            </button>
          </div>
        )}

        {/* Domain trend selector */}
        {permaTrendData.length > 1 && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {PERMA_DOMAINS.map(d => (
                <button
                  key={d}
                  onClick={() => setActiveDomain(d)}
                  className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                    activeDomain === d
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-teal-400'
                  }`}
                >
                  {d === 'overall' ? 'Overall' : d}
                </button>
              ))}
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={permaTrendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v) => [v?.toFixed(1), PERMA_DOMAIN_LABELS[activeDomain] ?? activeDomain]} />
                <Line type="monotone" dataKey="score" stroke={DOMAIN_COLOR[activeDomain] ?? '#14b8a6'} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
            <p className="text-xs text-gray-400 text-center">
              {PERMA_DOMAIN_LABELS[activeDomain]} over time
            </p>
          </div>
        )}
      </div>

      {/* ── Update button ─────────────────────────────────────── */}
      {!isDue && (
        <div className="text-center">
          <button
            onClick={() => setShowQFlow(true)}
            className="text-sm text-teal-600 font-medium hover:underline"
          >
            Update my check-in now
          </button>
          {schedule?.next_due_at && (
            <p className="text-xs text-gray-400 mt-1">
              Next due: {new Date(schedule.next_due_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          )}
        </div>
      )}

      {/* QuestionnaireFlow modal */}
      {showQFlow && (
        <QuestionnaireFlow
          onClose={() => {
            setShowQFlow(false)
            // Reload page data after closing
            setLoading(true)
            window.location.reload()
          }}
        />
      )}

    </main>
  )
}
