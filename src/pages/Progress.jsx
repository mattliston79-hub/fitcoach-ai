import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { BADGE_LABELS } from '../utils/badges'

// ── Shared constants ────────────────────────────────────────────────────────

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

const PRACTICE_LABELS = {
  body_scan:          'Body Scan',
  breath_focus:       'Breath Focus',
  grounding:          'Grounding',
  mindful_walking:    'Mindful Walk',
  nature_observation: 'Nature Pause',
  pre_sleep:          'Pre-Sleep',
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

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function sessionLabel(s) {
  if (s.session_type === 'mindfulness' && s.practice_type) {
    return PRACTICE_LABELS[s.practice_type] ?? 'Mindfulness'
  }
  return s.session_type?.replace(/_/g, ' ') ?? 'Session'
}

// ── Tabs ────────────────────────────────────────────────────────────────────

const TABS = ['History', 'Records', 'Badges', 'Wellbeing']

// ── History tab ─────────────────────────────────────────────────────────────

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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 mt-1">
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
            <p className="text-base font-bold text-slate-700">{fmtDate(session.date)}</p>
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
          className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm py-3 rounded-xl transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}

function HistoryTab({ sessions }) {
  const [selected, setSelected] = useState(null)

  if (!sessions.length) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400 text-sm">No sessions logged yet.</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-2">
        {sessions.map(s => {
          const colorClass = SESSION_COLORS[s.session_type] ?? 'bg-gray-100 text-gray-700'
          return (
            <button
              key={s.id}
              onClick={() => setSelected(s)}
              className="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-3 flex items-center gap-3 hover:border-teal-200 hover:shadow-md transition-all"
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
                {s.duration_mins && (
                  <p className="text-xs text-gray-500">{s.duration_mins} min</p>
                )}
                {s.rpe && (
                  <p className="text-xs text-gray-400">RPE {s.rpe}</p>
                )}
              </div>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-300 shrink-0">
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )
        })}
      </div>
      <SessionModal session={selected} onClose={() => setSelected(null)} />
    </>
  )
}

// ── Records tab ─────────────────────────────────────────────────────────────

function RecordsTab({ records }) {
  if (!records.length) {
    return (
      <div className="text-center py-16 px-6">
        <p className="text-gray-400 text-sm leading-relaxed">
          No personal records yet. Log a strength session to start.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Exercise</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Best</th>
            <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {records.map((r, i) => (
            <tr key={i} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 font-medium text-slate-800 capitalize">{r.exercise_name}</td>
              <td className="px-4 py-3 text-right">
                <span className="font-bold text-teal-600">{r.weight_kg} kg</span>
                <span className="text-gray-400 ml-1">× {r.reps}</span>
              </td>
              <td className="px-4 py-3 text-right text-gray-400 text-xs whitespace-nowrap">{fmtDate(r.date)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Badges tab ───────────────────────────────────────────────────────────────

function BadgesTab({ earnedBadges }) {
  const earnedMap = {}
  for (const b of earnedBadges) earnedMap[b.badge_key] = b.date_earned

  const allKeys = Object.keys(BADGE_LABELS)
  const hasAny  = earnedBadges.length > 0

  if (!hasAny) {
    return (
      <div className="text-center py-16 px-6">
        <p className="text-gray-400 text-sm leading-relaxed">
          Complete your first session to earn your first badge.
        </p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 gap-3">
      {allKeys.map((key, i) => {
        const isEarned = key in earnedMap
        const label    = BADGE_LABELS[key]
        const date     = earnedMap[key]
        const color    = BADGE_COLORS[i % BADGE_COLORS.length]

        return (
          <div
            key={key}
            className={`rounded-xl border p-3 text-center transition-all ${
              isEarned
                ? `${color} shadow-sm`
                : 'bg-gray-50 border-gray-100 opacity-40'
            }`}
          >
            <p className={`text-xs font-semibold leading-tight mb-1 ${isEarned ? '' : 'text-gray-400'}`}>
              {label}
            </p>
            {isEarned && date && (
              <p className="text-xs opacity-60">{fmtDate(date)}</p>
            )}
            {!isEarned && (
              <p className="text-xs text-gray-300">Locked</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Wellbeing tab ────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 5, color = 'bg-teal-500' }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-sm font-semibold text-slate-700 w-8 text-right">{value.toFixed(1)}</span>
    </div>
  )
}

function WellbeingTab({ wellbeingLogs, socialCount, bodyScanCount, navigate }) {
  if (wellbeingLogs.length < 3) {
    return (
      <div className="text-center py-16 px-6 space-y-4">
        <p className="text-gray-400 text-sm leading-relaxed">
          Keep logging your wellbeing to see trends here.
        </p>
        <button
          onClick={() => navigate('/wellbeing')}
          className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
        >
          Log today's wellbeing
        </button>
      </div>
    )
  }

  const avg = (key) => {
    const vals = wellbeingLogs.filter(r => r[key] != null).map(r => r[key])
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const avgMood   = avg('mood_score')
  const avgSleep  = avg('sleep_quality')
  const avgEnergy = avg('energy_score')

  return (
    <div className="space-y-4">
      {/* Score bars */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Last 28 days — averages</p>

        {avgMood !== null && (
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <p className="text-sm font-medium text-slate-700">Mood</p>
            </div>
            <ScoreBar value={avgMood} color="bg-blue-400" />
          </div>
        )}

        {avgSleep !== null && (
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <p className="text-sm font-medium text-slate-700">Sleep quality</p>
            </div>
            <ScoreBar value={avgSleep} color="bg-violet-400" />
          </div>
        )}

        {avgEnergy !== null && (
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <p className="text-sm font-medium text-slate-700">Energy</p>
            </div>
            <ScoreBar value={avgEnergy} color="bg-amber-400" />
          </div>
        )}
      </div>

      {/* Counts */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-teal-600 mb-1">{socialCount}</p>
          <p className="text-xs text-gray-400 leading-tight">Social activities<br/>this month</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
          <p className="text-3xl font-bold text-teal-600 mb-1">{bodyScanCount}</p>
          <p className="text-xs text-gray-400 leading-tight">Body scans<br/>completed</p>
        </div>
      </div>

      {/* Log count */}
      <p className="text-center text-xs text-gray-400">
        Based on {wellbeingLogs.length} wellbeing {wellbeingLogs.length === 1 ? 'log' : 'logs'} in the last 28 days
      </p>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function Progress() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const userId      = session.user.id

  const [activeTab, setActiveTab] = useState('History')
  const [loading,   setLoading]   = useState(true)

  const [sessions,      setSessions]      = useState([])
  const [records,       setRecords]       = useState([])
  const [earnedBadges,  setEarnedBadges]  = useState([])
  const [wellbeingLogs, setWellbeingLogs] = useState([])
  const [socialCount,   setSocialCount]   = useState(0)
  const [bodyScanCount, setBodyScanCount] = useState(0)

  useEffect(() => {
    async function load() {
      const since28 = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)

      const [sessRes, recRes, badgeRes, wbRes, socialRes, mindfulRes, loggedMindfulRes] = await Promise.all([
        supabase
          .from('sessions_logged')
          .select('id, date, session_type, practice_type, title, duration_mins, rpe, notes')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(200),

        supabase
          .from('personal_records')
          .select('exercise_name, weight_kg, reps, one_rep_max_kg, date')
          .eq('user_id', userId)
          .order('date', { ascending: false }),

        supabase
          .from('badges')
          .select('badge_key, badge_label, date_earned')
          .eq('user_id', userId)
          .not('badge_key', 'is', null),

        supabase
          .from('wellbeing_logs')
          .select('date, mood_score, energy_score, sleep_quality')
          .eq('user_id', userId)
          .gte('date', since28)
          .order('date', { ascending: false }),

        supabase
          .from('social_activity_logs')
          .select('id')
          .eq('user_id', userId)
          .gte('date', since28),

        // Body scans from legacy mindfulness_logs
        supabase
          .from('mindfulness_logs')
          .select('id')
          .eq('user_id', userId)
          .eq('completed', true)
          .gte('date', since28),

        // Body scans from new sessions_logged
        supabase
          .from('sessions_logged')
          .select('id')
          .eq('user_id', userId)
          .eq('session_type', 'mindfulness')
          .eq('practice_type', 'body_scan')
          .gte('date', since28),
      ])

      setSessions(sessRes.data ?? [])
      setRecords(recRes.data ?? [])
      setEarnedBadges(badgeRes.data ?? [])
      setWellbeingLogs(wbRes.data ?? [])
      setSocialCount((socialRes.data ?? []).length)
      setBodyScanCount((mindfulRes.data ?? []).length + (loggedMindfulRes.data ?? []).length)
      setLoading(false)
    }
    load()
  }, [userId])

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-12">

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Progress</h1>
        <p className="text-sm text-gray-400 mt-0.5">Your history, records, and wellbeing.</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-2xl p-1 mb-6">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
              activeTab === tab
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'History'   && <HistoryTab   sessions={sessions} />}
          {activeTab === 'Records'   && <RecordsTab   records={records} />}
          {activeTab === 'Badges'    && <BadgesTab    earnedBadges={earnedBadges} />}
          {activeTab === 'Wellbeing' && <WellbeingTab wellbeingLogs={wellbeingLogs} socialCount={socialCount} bodyScanCount={bodyScanCount} navigate={navigate} />}
        </>
      )}
    </main>
  )
}
