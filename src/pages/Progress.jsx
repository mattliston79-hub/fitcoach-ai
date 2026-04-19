import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { getFullProgramme } from '../coach/programmeService'
import { checkAndAwardBadges } from '../lib/checkBadges'
import {
  LineChart, Line, BarChart, Bar, ReferenceLine, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts'

// ─────────────────────────────────────────────────────────────────────────────
// Constants & Styling
// ─────────────────────────────────────────────────────────────────────────────

// CM0 Guidelines for Activity Tab
function getCmoGuideline(age) {
  const a = parseInt(age || 30, 10)
  if (a < 5) return null
  if (a < 18) return { mins: 60, label: 'Children: 60 min/day' }
  if (a <= 64) return { mins: 150, label: 'Adults: 150 min/week' }
  return { mins: 150, label: 'Adults 65+: 150 min/week' }
}

const PRACTICE_LABELS = {
  body_scan: 'Body Scan',
  breath_focus: 'Breath Focus',
  grounding: 'Grounding',
  mindful_walking: 'Mindful Walk',
  nature_observation: 'Nature Pause',
  pre_sleep: 'Pre-Sleep',
  weekly_review: 'Weekly check-in',
}

function ScoreDot({ score }) {
  if (score === null || score === undefined) return <span className="text-slate-300 text-xs">—</span>
  const colours = ['bg-red-400', 'bg-amber-400', 'bg-teal-400', 'bg-emerald-500']
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colours[score] ?? 'bg-slate-200'}`} />
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function calcCurrentWeek(createdAt, totalWeeks) {
  const days = (Date.now() - new Date(createdAt).getTime()) / 86_400_000
  return Math.min(Math.max(Math.ceil(days / 7), 1), totalWeeks)
}

function getMondayOf(dateInput) {
  const d = new Date(dateInput)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
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

function e1RM(weight, reps) {
  if (!weight || !reps || weight <= 0 || reps <= 0) return 0
  return reps === 1 ? weight : weight * (1 + reps / 30)
}

function getInitials(label) {
  return label.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Components 
// ─────────────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex justify-center items-center h-64">
      <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
}

function SectionHeading({ children, subtitle }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-serif font-bold text-teal-900 tracking-tight leading-tight">
        {children}
      </h2>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  )
}

// ── Tab 1: Activity ────────────────────────────────────────────────────────

function WeekActivitySection({ thisWeekMins, cmo, weekStart }) {
  const cmoTarget = cmo?.mins ?? 150
  const cmoPct = Math.min(100, Math.round((thisWeekMins / cmoTarget) * 100))

  const startDate = new Date(weekStart)
  const endDate = new Date(weekStart)
  endDate.setDate(startDate.getDate() + 6)
  const fmt = { day: 'numeric', month: 'short' }
  const dateStr = weekStart ? `${startDate.toLocaleDateString('en-GB', fmt)} - ${endDate.toLocaleDateString('en-GB', fmt)}` : ''

  return (
    <div className="bg-white rounded-[1.5rem] p-6 border border-teal-100/30 shadow-premium-sm transition-all hover:shadow-premium mb-6">
      <p className="text-xs font-semibold text-teal-800/60 uppercase tracking-widest mb-4">This Week's Activity {dateStr ? `(${dateStr})` : ''}</p>
      <div className="flex items-end justify-between mb-3">
        <span className="text-4xl font-serif font-bold text-teal-900 leading-none">{thisWeekMins}</span>
        <span className="text-sm font-medium text-teal-700/60 leading-none pb-1">/ {cmoTarget} min goal</span>
      </div>
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-3 shadow-inner">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${cmoPct >= 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
          style={{ width: `${cmoPct}%` }}
        />
      </div>
      <div className="flex justify-between items-center text-xs">
        <span className={`font-medium ${cmoPct >= 100 ? 'text-emerald-700' : 'text-amber-700'}`}>
          {cmoPct >= 100 ? '✓ Goal met' : `${cmoTarget - thisWeekMins} min remaining`}
        </span>
        {cmo && <span className="text-gray-400">{cmo.label}</span>}
      </div>
    </div>
  )
}

function DailyStepsSection({ steps, stepInput, setStepInput, handleSaveSteps, stepSaving }) {
  return (
    <div className="bg-white rounded-[1.5rem] p-6 border border-teal-100/30 shadow-premium-sm transition-all hover:shadow-premium mb-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs font-semibold text-teal-800/60 uppercase tracking-widest">Daily Steps (7 Days)</p>
        <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full uppercase">10k goal</span>
      </div>

      {steps.length > 0 ? (
        <div className="mb-6 -mx-2">
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={steps} margin={{ top: 10, right: 10, left: -24, bottom: 0 }}>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#64748B' }} tickFormatter={d => d.slice(5)} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${v.toLocaleString()}`, 'Steps']} labelStyle={{ fontSize: 11, color: '#0f172a' }} cursor={{ fill: '#f8fafc' }} />
              <ReferenceLine y={10000} stroke="#f59e0b" strokeDasharray="4 4" opacity={0.6} />
              <Bar dataKey="step_count" radius={[4, 4, 0, 0]}>
                {steps.map((entry) => (
                  <Cell key={entry.date} fill={entry.step_count >= 10000 ? '#14b8a6' : '#cbd5e1'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-6">No step data yet</p>
      )}

      <div className="flex gap-2">
        <input
          type="number"
          placeholder="Log steps for today"
          value={stepInput}
          onChange={e => setStepInput(e.target.value)}
          className="flex-1 border border-teal-100 bg-teal-50/30 rounded-xl px-4 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
        <button
          onClick={handleSaveSteps}
          disabled={!stepInput || stepSaving}
          className="bg-teal-700 hover:bg-teal-800 active:bg-teal-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-40 shadow-sm"
        >
          {stepSaving ? '…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function weekBlockStyle(weekNum, sessions, currentWeek) {
  const base = { width: 32, height: 32, borderRadius: 8, flexShrink: 0, boxSizing: 'border-box' }
  const teal = '#0f766e'

  if (weekNum > currentWeek) return { ...base, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }
  if (!sessions.length) {
    if (weekNum === currentWeek) return { ...base, backgroundColor: 'white', border: `2px solid ${teal}` }
    return { ...base, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }
  }
  if (sessions.every(s => s.status === 'complete')) return { ...base, backgroundColor: teal }
  if (weekNum === currentWeek) return { ...base, backgroundColor: 'white', border: `2px solid ${teal}` }
  if (sessions.some(s => s.status === 'complete')) {
    return { ...base, background: `linear-gradient(to bottom, ${teal} 50%, white 50%)`, border: `2px solid ${teal}` }
  }
  return { ...base, backgroundColor: '#f8fafc', border: '1px solid #e2e8f0' }
}

function ProgrammeArc({ programme, programmeSessions, currentWeek }) {
  const totalWeeks = programme.total_weeks
  const byWeek = {}
  for (let w = 1; w <= totalWeeks; w++) {
    byWeek[w] = programmeSessions.filter(s => s.week_number === w)
  }

  return (
    <div className="bg-white rounded-[1.5rem] p-6 border border-teal-100/30 shadow-premium-sm mb-6">
      <SectionHeading subtitle={`${currentWeek} of ${totalWeeks} weeks • Your programme timeline`}>Training Cycle</SectionHeading>
      <div className="flex gap-2 pb-2 mt-4" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
        {Array.from({ length: totalWeeks }, (_, i) => i + 1).map(w => (
          <div key={w} style={weekBlockStyle(w, byWeek[w] ?? [], currentWeek)} title={`Week ${w}`} />
        ))}
      </div>
    </div>
  )
}

const HEATMAP_LEGEND = [
  { bg: '#0f766e', border: null, label: 'Logged' },
  { bg: '#ccfbf1', border: '#5eead4', label: 'Planned' },
  { bg: '#f1f5f9', border: null, label: 'Rest' },
]

function ConsistencyHeatmap({ programme, programmeSessions, loggedDateSet, plannedDateSet }) {
  const programmeStart = getMondayOf(programme.created_at)
  const createdDay = new Date(programme.created_at)
  createdDay.setHours(0, 0, 0, 0)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const squares = Array.from({ length: 84 }, (_, i) => {
    const d = new Date(programmeStart)
    d.setDate(programmeStart.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    const isFuture = d > today
    const isPreStart = d < createdDay

    let bg, border = null
    if (isFuture || isPreStart) {
      bg = 'white'; border = '#e2e8f0'
    } else if (loggedDateSet.has(iso)) {
      bg = '#0f766e'
    } else if (plannedDateSet.has(iso)) {
      bg = '#ccfbf1'; border = '#5eead4'
    } else {
      bg = '#f1f5f9'
    }
    return { iso, bg, border }
  })

  return (
    <div className="bg-white rounded-[1.5rem] p-6 border border-teal-100/30 shadow-premium-sm mb-6">
      <SectionHeading subtitle="Your 12-week consistency map">Consistency Heatmap</SectionHeading>
      <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
        {squares.map(({ iso, bg, border }) => (
          <div key={iso} title={iso} className="aspect-square rounded-md transition-all hover:scale-110 cursor-pointer"
            style={{ backgroundColor: bg, ...(border ? { border: `1px solid ${border}` } : {}) }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-4 mt-5 justify-center">
        {HEATMAP_LEGEND.map(({ bg, border, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: bg, ...(border ? { border: `1px solid ${border}` } : {}) }} />
            <span className="text-xs text-slate-500 font-medium">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tab 2: Strength ────────────────────────────────────────────────────────

function StrengthProgress({ flatSets }) {
  const byExercise = {}
  for (const s of flatSets) {
    if (!byExercise[s.exercise_name]) byExercise[s.exercise_name] = []
    byExercise[s.exercise_name].push(s)
  }

  const charts = []
  for (const [name, sets] of Object.entries(byExercise)) {
    const byDate = {}
    for (const s of sets) {
      const orm = e1RM(s.weight_kg, s.reps)
      if (orm > 0 && (!byDate[s.date] || orm > byDate[s.date])) byDate[s.date] = orm
    }
    const dates = Object.keys(byDate).sort()
    if (dates.length < 2) continue

    const data = dates.map(d => ({ date: fmtDateShort(d), e1RM: Math.round(byDate[d] * 10) / 10 }))
    const first = data[0].e1RM
    const best = Math.max(...data.map(d => d.e1RM))
    const pct = first > 0 ? ((best - first) / first) * 100 : 0
    charts.push({ name, data, first, best, pct, lastDate: dates[dates.length - 1] })
  }
  charts.sort((a, b) => b.lastDate.localeCompare(a.lastDate))

  if (charts.length === 0) return null

  return (
    <div className="mb-6 space-y-4">
      {charts.map(({ name, data, first, best, pct }) => {
        const positive = pct > 0
        const pctColor = positive ? 'text-emerald-600' : 'text-slate-400'
        const pctDisplay = `${positive ? '+' : ''}${pct.toFixed(1)}%`
        return (
          <div key={name} className="bg-white rounded-[1.5rem] border border-teal-100/30 shadow-premium-sm p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-lg font-serif font-bold text-teal-950 capitalize leading-tight">{name}</p>
                <p className="text-xs font-medium text-slate-400 mt-0.5">Estimated 1RM</p>
              </div>
              <span className={`text-[11px] font-bold px-2 py-1 bg-slate-50 rounded-lg ${pctColor}`}>{pctDisplay}</span>
            </div>

            <div className="-mx-4 text-xs font-sans">
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -20 }}>
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#94a3b8' }} axisLine={false} tickLine={false} width={46} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0f766e', fontWeight: 'bold' }} />
                  <Line type="monotone" dataKey="e1RM" stroke="#0f766e" strokeWidth={3} dot={{ fill: '#0f766e', strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: '#0f766e' }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PersonalRecordsList({ records }) {
  if (records.length === 0) return null
  const now = Date.now()
  return (
    <div className="bg-white rounded-[1.5rem] border border-teal-100/30 shadow-premium-sm overflow-hidden mb-6">
      <div className="px-6 py-5 border-b border-gray-50 bg-gray-50/50">
        <SectionHeading subtitle="Your heaviest lifts mapped">Personal Records</SectionHeading>
      </div>
      <div className="divide-y divide-gray-50">
        {records.map((r, i) => {
          const isNew = r.date && (now - new Date(r.date).getTime()) < 7 * 864e5
          return (
            <div key={i} className="flex justify-between items-center px-6 py-4 hover:bg-slate-50 transition-colors">
              <div className="min-w-0 pr-4">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="font-medium text-slate-800 capitalize leading-tight">{r.exercise_name}</span>
                  {isNew && <span className="text-[9px] font-bold bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded uppercase tracking-wider">New</span>}
                </div>
                <p className="text-xs text-slate-400">{fmtDate(r.date)}</p>
              </div>
              <div className="text-right whitespace-nowrap">
                <span className="font-serif font-bold text-teal-900 text-lg">{r.weight_kg}kg</span>
                <span className="text-xs text-slate-500 ml-1">× {r.reps}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function DetailedWorkoutHistory({ sessions }) {
  const [expandedId, setExpandedId] = useState(null)

  if (sessions.length === 0) {
    return (
      <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
        <p className="text-sm text-slate-400">No workout history yet.</p>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <SectionHeading subtitle="Your complete training log">Workout History</SectionHeading>
      <div className="space-y-3">
        {sessions.map(session => {
          const isOpen = expandedId === session.id
          const label = session.session_type?.replace(/_/g, ' ') ?? 'Session'
          const dateStr = session.date ? new Date(session.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'

          return (
            <div key={session.id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden transition-all">
              <button
                onClick={() => setExpandedId(isOpen ? null : session.id)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-slate-50 transition-colors"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1 text-[10px] uppercase tracking-widest font-bold text-teal-700/60">
                    <span>{label}</span>
                    {session.duration_mins && <span>• {session.duration_mins}m</span>}
                    {session.rpe && <span>• RPE {session.rpe}</span>}
                  </div>
                  <p className="font-medium text-slate-900 leading-tight">
                    {session.title || 'Training Session'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">{dateStr}</p>
                </div>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center bg-slate-50 border border-slate-100 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 px-5 flex flex-col bg-slate-50/50 pb-5">
                  {session.notes && (
                    <div className="pt-4 pb-2 text-sm text-slate-600"><span className="font-medium text-slate-800">Notes:</span> {session.notes}</div>
                  )}
                  {session.exercises?.length > 0 ? (
                    <div className="overflow-x-auto mt-4 w-full">
                      <table className="w-full text-left text-xs whitespace-nowrap">
                        <thead>
                          <tr className="text-slate-400 uppercase tracking-wider text-[10px] font-semibold border-b border-slate-200">
                            <th className="pb-2 pr-3">Exercise</th>
                            <th className="pb-2 text-center pr-3">Sets</th>
                            <th className="pb-2 pr-3">Top Set</th>
                            <th className="pb-2 text-center px-1" title="Movement Quality">Move</th>
                            <th className="pb-2 text-center px-1" title="Load Feeling">Load</th>
                            <th className="pb-2 text-center pl-1" title="Reserve Volume">Vol</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {session.exercises.map((ex, i) => {
                            const bestSet = ex.sets.reduce((best, s) => {
                              if (!best) return s
                              const bScore = (best.weight_kg ?? 0) * (best.reps ?? 0)
                              const sScore = (s.weight_kg ?? 0) * (s.reps ?? 0)
                              return sScore >= bScore ? s : best
                            }, null)
                            const bestLabel = bestSet ? `${bestSet.reps ?? '—'} × ${bestSet.weight_kg != null ? `${bestSet.weight_kg}kg` : 'bw'}` : '—'

                            return (
                              <tr key={i} className="align-middle group">
                                <td className="py-3 pr-3 font-medium text-slate-800 capitalize">{ex.name}</td>
                                <td className="py-3 text-center pr-3 font-mono text-slate-500">{ex.sets.length}</td>
                                <td className="py-3 pr-3 font-mono font-medium text-teal-800">{bestLabel}</td>
                                <td className="py-3 px-1 text-center"><ScoreDot score={ex.feedback?.coordination_score} /></td>
                                <td className="py-3 px-1 text-center"><ScoreDot score={ex.feedback?.load_score} /></td>
                                <td className="py-3 pl-1 text-center"><ScoreDot score={ex.feedback?.reserve_score} /></td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 pt-4">No logged sets for this session.</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tab 3: Achievements ────────────────────────────────────────────────────

function PremiumBadgesSection({ allBadges, earnedBadges }) {
  const earnedMap = {}
  for (const b of earnedBadges) earnedMap[b.badge_id] = b.earned_at

  return (
    <div className="mb-8">
      <SectionHeading subtitle="Collect badges to mark major milestones">Wall of Fame</SectionHeading>
      <div className="grid grid-cols-2 gap-4 mt-4">
        {allBadges.map(badge => {
          const isEarned = badge.id in earnedMap
          const label = badge.name
          const initials = getInitials(label)

          if (isEarned) {
            return (
              <div key={badge.id} className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#1b2522] to-[#0d1311] p-5 shadow-premium border border-[#2c3d38] flex flex-col items-center justify-center min-h-[160px] group transition-all hover:scale-[1.02]">
                {/* Subtle glow / back light */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/20 rounded-full blur-3xl -mt-10 -mr-10 transition-opacity group-hover:opacity-100 opacity-60" />

                {/* The Medal */}
                <div className="relative z-10 w-16 h-16 rounded-full bg-gradient-to-tr from-[#0f766e] to-[#2dd4bf] p-[2px] shadow-lg mb-4">
                  <div className="w-full h-full rounded-full bg-[#1b2522] flex items-center justify-center shadow-inner">
                    <span className="font-serif text-2xl font-bold bg-gradient-to-tr from-[#2dd4bf] to-[#99f6e4] bg-clip-text text-transparent transform scale-y-110">{initials}</span>
                  </div>
                </div>

                {/* Text */}
                <p className="relative z-10 text-sm font-semibold text-teal-50 px-1 leading-tight text-center truncate w-full">{label}</p>
                <p className="relative z-10 text-[10px] text-teal-400 mt-1 uppercase tracking-widest font-mono">{fmtDate(earnedMap[badge.id])}</p>
              </div>
            )
          } else {
            return (
              <div key={badge.id} className="rounded-[1.5rem] bg-white border border-dashed border-slate-200 p-5 flex flex-col items-center justify-center min-h-[160px] opacity-70">
                <div className="w-14 h-14 rounded-full border border-slate-200 bg-slate-50 flex items-center justify-center mb-4">
                  <span className="text-2xl opacity-50">{badge.icon_emoji || '🏆'}</span>
                </div>
                <p className="text-xs font-semibold text-slate-400 leading-tight text-center px-2">{label}</p>
              </div>
            )
          }
        })}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function Progress() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userId = session.user.id

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('activity') // activity, strength, achievements

  // Data State
  const [programme, setProgramme] = useState(null)
  const [programmeSess, setProgrammeSess] = useState([])
  const [currentWeek, setCurrentWeek] = useState(1)
  const [flatSets, setFlatSets] = useState([])
  const [loggedDates, setLoggedDates] = useState(new Set())
  const [plannedDates, setPlannedDates] = useState(new Set())
  const [sessions, setSessions] = useState([]) // detailed sessions
  const [records, setRecords] = useState([])
  const [earnedBadges, setEarnedBadges] = useState([])
  const [allBadges, setAllBadges] = useState([])
  const [steps, setSteps] = useState([])
  const [activityMins, setActivityMins] = useState([])
  const [profile, setProfile] = useState(null)

  // Form state
  const [stepInput, setStepInput] = useState('')
  const [stepSaving, setStepSaving] = useState(false)

  useEffect(() => {
    let cancelled = false

    // Background badge awarder
    checkAndAwardBadges(userId).catch(console.error)

    async function load() {
      const since7DaysAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
      const since6MonthsAgo = new Date(Date.now() - 180 * 864e5).toISOString().slice(0, 10)

      const [
        fullProgResult,
        sessDetailedResult, // replaces sessHistResult + sessWithSetsResult for unified detailed view
        sessLoggedDatesResult,
        sessPlannedDatesResult,
        recordsResult,
        badgeResult,
        allBadgesResult,
        stepsResult,
        activityMinsResult,
        profileResult,
        manualActivityResult
      ] = await Promise.all([
        getFullProgramme(userId),

        // Step 1: Just fetch the core sessions list without nested queries
        supabase.from('sessions_logged').select(`
          id, date, session_type, duration_mins
        `).eq('user_id', userId).order('date', { ascending: false }).limit(200),

        supabase.from('sessions_logged').select('date').eq('user_id', userId),
        supabase.from('sessions_planned').select('date').eq('user_id', userId),

        supabase.from('personal_records').select('exercise_name, weight_kg, reps, date:created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', userId).order('earned_at', { ascending: false }),
        supabase.from('badges').select('id, name, description, icon_emoji, trigger_key'),

        supabase.from('daily_steps').select('date, step_count').eq('user_id', userId).gte('date', since7DaysAgo).order('date', { ascending: true }),
        supabase.from('sessions_logged').select('date, duration_mins').eq('user_id', userId).gte('date', since6MonthsAgo).order('date', { ascending: true }),
        supabase.from('user_profiles').select('age').eq('user_id', userId).maybeSingle(),
        supabase.from('activity_log').select('logged_at, duration_mins').eq('user_id', userId).gte('logged_at', since6MonthsAgo)
      ])

      if (cancelled) return

      // DEBUG ONLY: Remove before final
      if (fullProgResult.error) console.error("fullProgResult error:", fullProgResult.error)
      if (sessDetailedResult.error) console.error("sessDetailedResult error:", sessDetailedResult.error)
      if (recordsResult.error) console.error("recordsResult error:", recordsResult.error)
      if (badgeResult.error) console.error("badgeResult error:", badgeResult.error)

      // Step 2: Fetch related sets & feedback manually using the IDs
      const rawSessions = sessDetailedResult.data ?? []
      const sessionIds = rawSessions.map(s => s.id)

      let setsRes = { data: [] }
      let feedbackRes = { data: [] }

      if (sessionIds.length > 0) {
        const [s, f] = await Promise.all([
          supabase.from('exercise_sets')
            .select('session_logged_id, exercise_name, set_number, reps, weight_kg')
            .in('session_logged_id', sessionIds),
          supabase.from('exercise_feedback')
            .select('session_logged_id, exercise_id, coordination_score, reserve_score, load_score, skipped')
            .in('session_logged_id', sessionIds)
        ])
        setsRes = s
        feedbackRes = f
      }

      const setsMap = {}
      const fbMap = {}

      for (const set of (setsRes.data ?? [])) {
        if (!setsMap[set.session_logged_id]) setsMap[set.session_logged_id] = []
        setsMap[set.session_logged_id].push(set)
      }

      for (const fb of (feedbackRes.data ?? [])) {
        if (!fbMap[fb.session_logged_id]) fbMap[fb.session_logged_id] = []
        fbMap[fb.session_logged_id].push(fb)
      }

      // Load Profile & Activity (from MyData logic)
      setProfile(profileResult.data ?? null)
      setSteps(stepsResult.data ?? [])

      // Aggregate minutes by week
      const weekMap = {}
      for (const s of (activityMinsResult.data ?? [])) {
        const d = new Date(s.date)
        const monday = new Date(d)
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        const wk = monday.toISOString().slice(0, 10)
        if (!weekMap[wk]) weekMap[wk] = 0
        weekMap[wk] += (s.duration_mins || 0)
      }
      for (const a of (manualActivityResult.data ?? [])) {
        if (!a.logged_at) continue
        const d = new Date(a.logged_at)
        const monday = new Date(d)
        monday.setDate(d.getDate() - ((d.getDay() + 6) % 7))
        const wk = monday.toISOString().slice(0, 10)
        if (!weekMap[wk]) weekMap[wk] = 0
        weekMap[wk] += (a.duration_mins || 0)
      }
      setActivityMins(Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b)).map(([wk, mins]) => ({ week: wk, mins })))

      // Load Programme Arc
      const prog = fullProgResult.data?.programme ?? null
      const progSess = fullProgResult.data?.sessions ?? []
      setProgramme(prog)
      setProgrammeSess(progSess)
      if (prog) setCurrentWeek(calcCurrentWeek(prog.created_at, prog.total_weeks))

      // Process detailed sessions (Strength Tab)
      const formattedSessions = rawSessions.map(sess => {
        const sets = setsMap[sess.id] || []
        const fbs = fbMap[sess.id] || []

        const exerciseMap = {}
        for (const s of sets) {
          const name = s.exercise_name || 'Unknown'
          if (!exerciseMap[name]) exerciseMap[name] = []
          exerciseMap[name].push(s)
        }

        const exercises = Object.entries(exerciseMap).map(([name, exSets]) => {
          return { name, sets: exSets, feedback: fbs[0] ?? null } // Simple association for now
        })

        return { ...sess, exercises }
      })
      setSessions(formattedSessions)

      // Flatten sets for Strength Progress charts
      const flat = []
      for (const sess of formattedSessions) {
        for (const ex of sess.exercises) {
          for (const s of ex.sets) {
            if (s.weight_kg > 0 && s.reps > 0) flat.push({ exercise_name: ex.name, weight_kg: s.weight_kg, reps: s.reps, date: sess.date })
          }
        }
      }
      setFlatSets(flat)

      // Load remaining
      setLoggedDates(new Set((sessLoggedDatesResult.data ?? []).map(r => r.date)))
      setPlannedDates(new Set((sessPlannedDatesResult.data ?? []).map(r => r.date)))
      setRecords(recordsResult.data ?? [])
      setEarnedBadges(badgeResult.data ?? [])
      setAllBadges(allBadgesResult.data ?? [])

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
    await supabase.from('daily_steps').upsert({ user_id: userId, date: today, step_count: n }, { onConflict: 'user_id,date' })
    const since7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
    const { data } = await supabase.from('daily_steps').select('date, step_count').eq('user_id', userId).gte('date', since7).order('date', { ascending: true })
    setSteps(data ?? [])
    setStepInput('')
    setStepSaving(false)
  }

  // View Computations
  const cmo = getCmoGuideline(profile?.age)
  const thisWeekStart = (() => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10) })()
  const thisWeekMins = activityMins.find(w => w.week === thisWeekStart)?.mins ?? 0

  if (loading) return <main className="max-w-2xl mx-auto px-4 py-10"><Spinner /></main>

  // Empty state if absolutely no data across the board
  if (!programme && !sessions.length && steps.length === 0) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-20 text-center space-y-4">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
        </div>
        <h1 className="text-2xl font-serif font-bold text-slate-800">No data found yet</h1>
        <p className="text-slate-500">Log some steps, complete a session, or build a training programme to see your insights.</p>
        <button onClick={() => navigate('/')} className="mt-6 bg-teal-700 text-white font-semibold px-6 py-3 rounded-xl transition-all hover:bg-teal-800 shadow-sm">Go to Dashboard</button>
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 pb-32">
      <h1 className="text-3xl font-serif font-bold text-teal-950 tracking-tight mb-6 px-1">Your Progress</h1>

      {/* Tabs Layout */}
      <div className="flex bg-slate-100/70 p-1.5 rounded-2xl mb-8">
        {['activity', 'strength', 'achievements'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-semibold capitalize rounded-1xl transition-all duration-300 ease-out ${activeTab === tab ? 'bg-white text-teal-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="animate-fade-in px-1">

        {/* Tab 1: Activity */}
        {activeTab === 'activity' && (
          <div className="space-y-6">
            <WeekActivitySection thisWeekMins={thisWeekMins} cmo={cmo} weekStart={thisWeekStart} />
            <DailyStepsSection steps={steps} stepInput={stepInput} setStepInput={setStepInput} handleSaveSteps={handleSaveSteps} stepSaving={stepSaving} />
            {programme && <ProgrammeArc programme={programme} programmeSessions={programmeSess} currentWeek={currentWeek} />}
            {programme && <ConsistencyHeatmap programme={programme} programmeSessions={programmeSess} loggedDateSet={loggedDates} plannedDateSet={plannedDates} />}
          </div>
        )}

        {/* Tab 2: Strength */}
        {activeTab === 'strength' && (
          <div className="space-y-6">
            <StrengthProgress flatSets={flatSets} />
            <PersonalRecordsList records={records} />
            <DetailedWorkoutHistory sessions={sessions} />
          </div>
        )}

        {/* Tab 3: Achievements */}
        {activeTab === 'achievements' && (
          <div className="space-y-6">
            <PremiumBadgesSection allBadges={allBadges} earnedBadges={earnedBadges} />
          </div>
        )}

      </div>
    </main>
  )
}
