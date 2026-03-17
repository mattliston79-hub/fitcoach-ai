import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts'

// ── Domain config ──────────────────────────────────────────────────────────────
const DOMAIN = {
  physical:  { label: 'Roots',  icon: '🌱', color: '#0d9488', badge: 'bg-teal-100 text-teal-700 border-teal-200' },
  emotional: { label: 'Leaves', icon: '💙', color: '#3b82f6', badge: 'bg-blue-100 text-blue-700 border-blue-200' },
  social:    { label: 'Canopy', icon: '🌞', color: '#d97706', badge: 'bg-amber-100 text-amber-700 border-amber-200' },
}

// ── Activity type labels ───────────────────────────────────────────────────────
const ACTIVITY_TYPE_LABEL = {
  planned_session: 'Planned session',
  manual:          'Added manually',
  milestone:       'Milestone reached',
}

// ── Add-activity form: type options with pre-fill values ──────────────────────
const ACTIVITY_TYPES = [
  { value: 'walk',         label: 'Walk',            title: 'Morning walk',     domain: 'physical',  secondaryDomain: null },
  { value: 'run',          label: 'Run',             title: 'Morning run',      domain: 'physical',  secondaryDomain: null },
  { value: 'cycle',        label: 'Cycle',           title: 'Cycling session',  domain: 'physical',  secondaryDomain: null },
  { value: 'swim',         label: 'Swim',            title: 'Swimming session', domain: 'physical',  secondaryDomain: null },
  { value: 'gym_session',  label: 'Gym session',     title: 'Gym session',      domain: 'physical',  secondaryDomain: null },
  { value: 'yoga_pilates', label: 'Yoga or Pilates', title: 'Yoga session',     domain: 'physical',  secondaryDomain: 'emotional' },
  { value: 'meditation',   label: 'Meditation',      title: 'Meditation',       domain: 'emotional', secondaryDomain: null },
  { value: 'body_scan',    label: 'Body Scan',       title: 'Body scan',        domain: 'emotional', secondaryDomain: null },
  { value: 'social_time',  label: 'Social time',     title: 'Social time',      domain: 'social',    secondaryDomain: null },
  { value: 'rest',         label: 'Rest',            title: 'Rest day',         domain: 'emotional', secondaryDomain: null },
  { value: 'other',        label: 'Other',           title: '',                 domain: null,        secondaryDomain: null },
]

// ── Helpers ────────────────────────────────────────────────────────────────────
function todayISO()   { return new Date().toISOString().slice(0, 10) }
function nowTimeStr() {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtLoggedAt(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
}

function fmtDateHeader(dateStr) {
  const today     = todayISO()
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  if (dateStr === today)     return 'Today'
  if (dateStr === yesterday) return 'Yesterday'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

function fmtChartDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// ── Domain badge ───────────────────────────────────────────────────────────────
function DomainBadge({ domain, small = false }) {
  const d = DOMAIN[domain]
  if (!d) return null
  return (
    <span className={`inline-flex items-center gap-1 font-medium border rounded-full ${d.badge} ${
      small ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'
    }`}>
      {d.icon} {d.label}
    </span>
  )
}

// ── Activity card ──────────────────────────────────────────────────────────────
function ActivityCard({ entry, goalMap }) {
  const goalText  = entry.goal_id ? goalMap[entry.goal_id] : null
  const typeLabel = ACTIVITY_TYPE_LABEL[entry.activity_type] ?? entry.activity_type
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-sm font-semibold text-slate-800 leading-snug flex-1">{entry.title}</p>
        <span className="text-xs text-gray-400 shrink-0 mt-0.5">{fmtLoggedAt(entry.logged_at)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <DomainBadge domain={entry.domain} />
        {entry.secondary_domain && <DomainBadge domain={entry.secondary_domain} small />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-gray-400">{typeLabel}</span>
        {entry.duration_mins && (
          <span className="text-xs text-gray-400">⏱ {entry.duration_mins} min</span>
        )}
        {goalText && (
          <span className="text-xs text-gray-400 flex items-center gap-1">🎯 {goalText}</span>
        )}
      </div>

      {entry.note && (
        <p className="text-xs text-gray-400 italic mt-2 leading-relaxed">{entry.note}</p>
      )}
    </div>
  )
}

// ── Chart data builder ─────────────────────────────────────────────────────────
function buildChartData(logs, days) {
  const cutoff = days
    ? new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    : null

  const deltaFor = (entry) => {
    if (entry.activity_type === 'planned_session') return { primary: 5, secondary: 3 }
    if (entry.activity_type === 'manual')          return { primary: 3, secondary: 0 }
    if (entry.activity_type === 'milestone')       return { primary: 2, secondary: 0 }
    return { primary: 0, secondary: 0 }
  }

  const byDate = {}
  for (const entry of logs) {
    const date = entry.logged_at?.slice(0, 10)
    if (!date) continue
    if (cutoff && date < cutoff) continue
    if (!byDate[date]) byDate[date] = { physical: 0, emotional: 0, social: 0 }
    const { primary, secondary } = deltaFor(entry)
    if (entry.domain && entry.domain in byDate[date])
      byDate[date][entry.domain] += primary
    if (entry.secondary_domain && entry.secondary_domain in byDate[date])
      byDate[date][entry.secondary_domain] += secondary
  }

  const dates = Object.keys(byDate).sort()
  let p = 0, e = 0, s = 0
  return dates.map(date => {
    p += byDate[date].physical  ?? 0
    e += byDate[date].emotional ?? 0
    s += byDate[date].social    ?? 0
    return { date, physical: p, emotional: e, social: s }
  })
}

// ── Chart view ─────────────────────────────────────────────────────────────────
const CHART_RANGES = [
  { label: '7 days',   value: 7    },
  { label: '30 days',  value: 30   },
  { label: '3 months', value: 90   },
  { label: 'All time', value: null },
]

function ChartView({ logs }) {
  const [range, setRange] = useState(30)
  const data = buildChartData(logs, range)

  if (data.length < 3) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center mt-4">
        <p className="text-sm text-gray-400 leading-relaxed">
          Keep logging activities — your chart will appear here once you have a few days of data.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {/* Range filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {CHART_RANGES.map(r => (
          <button
            key={String(r.value)}
            onClick={() => setRange(r.value)}
            className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              range === r.value
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis
              dataKey="date"
              tickFormatter={fmtChartDate}
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(value, name) => [value, DOMAIN[name]?.label ?? name]}
              labelFormatter={fmtChartDate}
              contentStyle={{ borderRadius: '12px', border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            {/* TODO: growth stage history when oak_tree_states_history table is added */}
            <Line type="monotone" dataKey="physical"  stroke="#0d9488" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="emotional" stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="social"    stroke="#d97706" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>

        {/* Custom legend */}
        <div className="flex flex-wrap justify-center gap-4 mt-3">
          {Object.entries(DOMAIN).map(([key, d]) => (
            <div key={key} className="flex items-center gap-1.5">
              <span
                className="inline-block w-5 h-0.5 rounded-full"
                style={{ backgroundColor: d.color }}
              />
              <span className="text-xs text-gray-500">{d.icon} {d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── List view ──────────────────────────────────────────────────────────────────
function ListView({ logs, goalMap, domainFilter }) {
  const filtered = domainFilter === 'all'
    ? logs
    : logs.filter(e => e.domain === domainFilter || e.secondary_domain === domainFilter)

  if (filtered.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center mt-4">
        <p className="text-sm text-gray-400">
          No activities found{domainFilter !== 'all' ? ' for this domain' : ''} yet.
        </p>
      </div>
    )
  }

  // Group by date
  const groups = []
  let currentDate = null
  for (const entry of filtered) {
    const date = entry.logged_at?.slice(0, 10) ?? 'unknown'
    if (date !== currentDate) {
      currentDate = date
      groups.push({ date, entries: [] })
    }
    groups[groups.length - 1].entries.push(entry)
  }

  return (
    <div className="mt-4 space-y-5">
      {groups.map(group => (
        <div key={group.date}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1">
            {fmtDateHeader(group.date)}
          </p>
          <div className="space-y-2">
            {group.entries.map(entry => (
              <ActivityCard key={entry.id} entry={entry} goalMap={goalMap} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Add Activity panel ─────────────────────────────────────────────────────────
function AddActivityPanel({ goals, userId, onClose, onSaved }) {
  const panelRef = useRef(null)

  const [activityType,    setActivityType]    = useState('')
  const [title,           setTitle]           = useState('')
  const [domain,          setDomain]          = useState(null)
  const [secondaryDomain, setSecondaryDomain] = useState(null)
  const [date,            setDate]            = useState(todayISO)
  const [time,            setTime]            = useState(nowTimeStr)
  const [duration,        setDuration]        = useState('')
  const [goalId,          setGoalId]          = useState('')
  const [note,            setNote]            = useState('')
  const [saving,          setSaving]          = useState(false)
  const [error,           setError]           = useState(null)

  // Click outside to close
  useEffect(() => {
    function onMouseDown(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [onClose])

  function pickActivityType(value) {
    const opt = ACTIVITY_TYPES.find(t => t.value === value)
    setActivityType(value)
    if (opt) {
      setTitle(opt.title)
      setDomain(opt.domain)
      setSecondaryDomain(opt.secondaryDomain)
    }
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('Please enter a title.'); return }
    if (!domain)        { setError('Please select a domain.'); return }

    setSaving(true)
    setError(null)

    const loggedAt = new Date(`${date}T${time}`).toISOString()
    const row = {
      user_id:          userId,
      title:            title.trim(),
      domain,
      secondary_domain: secondaryDomain || null,
      activity_type:    'manual',
      activity_subtype: activityType || null,
      goal_id:          goalId || null,
      duration_mins:    duration ? parseInt(duration, 10) : null,
      note:             note.trim() || null,
      logged_at:        loggedAt,
    }

    const { data, error: insertError } = await supabase
      .from('activity_log')
      .insert(row)
      .select()
      .single()

    if (insertError) {
      setError('Failed to save. Please try again.')
      setSaving(false)
      return
    }

    // Nudge oak tree — non-blocking, never surfaces errors to the user
    supabase
      .rpc('nudge_tree_score', { p_user_id: userId, p_domain: domain, p_delta: 3 })
      .then(({ error: rpcErr }) => { if (rpcErr) console.error('nudge_tree_score error:', rpcErr) })

    onSaved(data)
    setSaving(false)
  }

  const inputCls = 'w-full text-sm text-slate-700 bg-white border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-400'

  return (
    <div ref={panelRef} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 mb-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-slate-800">Log an activity</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="space-y-3">
        {/* Activity type */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Activity type</label>
          <select value={activityType} onChange={e => pickActivityType(e.target.value)} className={inputCls}>
            <option value="">Select type…</option>
            {ACTIVITY_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Morning walk"
            className={inputCls}
          />
        </div>

        {/* Domain */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            Domain <span className="text-red-400">*</span>
          </label>
          <div className="flex gap-2">
            {Object.entries(DOMAIN).map(([key, d]) => (
              <button
                key={key}
                onClick={() => setDomain(key)}
                className={`flex-1 flex items-center justify-center gap-1 text-xs font-medium py-2 rounded-xl border transition-colors ${
                  domain === key
                    ? `${d.badge} border-current`
                    : 'border-gray-200 text-gray-400 hover:border-gray-300'
                }`}
              >
                {d.icon} {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date + time */}
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Duration */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Duration (mins, optional)</label>
          <input
            type="number"
            min="1"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            placeholder="e.g. 30"
            className={inputCls}
          />
        </div>

        {/* Goal link */}
        {goals.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Link to a goal (optional)</label>
            <select value={goalId} onChange={e => setGoalId(e.target.value)} className={inputCls}>
              <option value="">No goal</option>
              {goals.map(g => (
                <option key={g.id} value={g.id}>{g.goal_statement}</option>
              ))}
            </select>
          </div>
        )}

        {/* Note */}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Note (optional)</label>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 300))}
            placeholder="How did it go?"
            rows={2}
            className={`${inputCls} resize-none`}
          />
          <p className="text-[11px] text-gray-300 text-right mt-0.5">{note.length}/300</p>
        </div>

        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-xl px-3 py-2">{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
        >
          {saving ? 'Saving…' : 'Log Activity'}
        </button>
      </div>
    </div>
  )
}

// ── Domain filter tabs ─────────────────────────────────────────────────────────
const FILTER_TABS = [
  { key: 'all',       label: 'All' },
  { key: 'physical',  label: '🌱 Physical' },
  { key: 'emotional', label: '💙 Emotional' },
  { key: 'social',    label: '🌞 Social' },
]

// ── Main component ─────────────────────────────────────────────────────────────
export default function ActivityLog() {
  const { session }   = useAuth()
  const userId        = session.user.id

  const [logs,         setLogs]         = useState([])
  const [goalMap,      setGoalMap]      = useState({})
  const [activeGoals,  setActiveGoals]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [view,         setView]         = useState('list')
  const [domainFilter, setDomainFilter] = useState('all')
  const [showPanel,    setShowPanel]    = useState(false)

  useEffect(() => {
    async function load() {
      const [logsRes, goalsRes] = await Promise.all([
        supabase
          .from('activity_log')
          .select('id, title, domain, secondary_domain, activity_type, activity_subtype, goal_id, duration_mins, note, logged_at')
          .eq('user_id', userId)
          .order('logged_at', { ascending: false }),
        supabase
          .from('goals')
          .select('id, goal_statement, status')
          .eq('user_id', userId),
      ])

      const goals = goalsRes.data ?? []
      const map   = {}
      for (const g of goals) map[g.id] = g.goal_statement

      setGoalMap(map)
      setActiveGoals(goals.filter(g => g.status === 'active'))
      setLogs(logsRes.data ?? [])
      setLoading(false)
    }
    load()
  }, [userId])

  function handleSaved(newEntry) {
    setLogs(prev => [newEntry, ...prev])
    setShowPanel(false)
  }

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-12">

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Your Activity</h1>
          <p className="text-sm text-gray-400 mt-0.5">Everything you've done, in one place.</p>
        </div>
        <button
          onClick={() => setShowPanel(s => !s)}
          className="flex-shrink-0 flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-800 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Add Activity
        </button>
      </div>

      {/* Add Activity panel */}
      {showPanel && (
        <AddActivityPanel
          goals={activeGoals}
          userId={userId}
          onClose={() => setShowPanel(false)}
          onSaved={handleSaved}
        />
      )}

      {/* View toggle */}
      <div className="flex gap-2 mb-4">
        {['list', 'chart'].map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`text-sm font-medium px-4 py-2 rounded-xl border transition-colors ${
              view === v
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
          >
            {v === 'list' ? 'List' : 'Chart'}
          </button>
        ))}
      </div>

      {/* Domain filter tabs — list view only */}
      {view === 'list' && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setDomainFilter(tab.key)}
              className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                domainFilter === tab.key
                  ? 'bg-teal-600 text-white border-teal-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Views */}
      {view === 'list'
        ? <ListView  logs={logs} goalMap={goalMap} domainFilter={domainFilter} />
        : <ChartView logs={logs} />
      }

    </main>
  )
}
