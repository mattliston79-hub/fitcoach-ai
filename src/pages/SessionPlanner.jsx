import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { DndContext, DragOverlay, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import BlockReviewCard from '../components/BlockReviewCard'
import ProgrammeSummaryCollapsible from '../components/ProgrammeSummaryCollapsible'
import { MINDFULNESS_PRACTICES } from '../coach/mindfulnessKnowledge'

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
  mindfulness:     { bg: 'bg-teal-50',     border: 'border-teal-300',    badge: 'bg-teal-500',    text: 'text-teal-800'    },
}

const DEFAULT_COLOR = { bg: 'bg-gray-100', border: 'border-gray-300', badge: 'bg-gray-400', text: 'text-gray-700' }

const PRACTICE_TYPE_LABELS = {
  body_scan:          'Body Scan',
  breath_focus:       'Breath Focus',
  grounding:          'Grounding',
  mindful_walking:    'Mindful Walk',
  nature_observation: 'Nature Pause',
  pre_sleep:          'Pre-Sleep',
  journaling:         'Journaling',
}

const HIIT_TYPES = new Set(['hiit_bodyweight', 'plyometrics'])
const YOGA_TYPES = new Set(['yoga', 'pilates', 'flexibility'])
const loggerPath = (s) =>
  s.practice_type === 'journaling'    ? `/journaling/${s.id}` :
  s.session_type === 'mindfulness'    ? `/mindfulness/${s.id}` :
  HIIT_TYPES.has(s.session_type)      ? `/hiit/${s.id}` :
  YOGA_TYPES.has(s.session_type)      ? `/yoga/${s.id}` :
  `/session/${s.id}`

const DAY_LABELS   = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTH_NAMES  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Helpers ────────────────────────────────────────────────────────────────
// Returns YYYY-MM-DD using local time (toISOString() uses UTC and shifts by tz offset)
function localDateStr(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function getWeekDates(offset = 0) {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7) + offset * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return localDateStr(d)
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

// ── Overflow menu ───────────────────────────────────────────────────────────
function OverflowMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onMouseDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white/60 transition-colors"
        aria-label="More options"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="7" cy="2"   r="1.4" />
          <circle cx="7" cy="7"   r="1.4" />
          <circle cx="7" cy="12" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {items.map((item, i) => (
            <button
              key={i}
              onClick={e => { e.stopPropagation(); item.onClick(); setOpen(false) }}
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                item.danger
                  ? 'text-red-500 hover:bg-red-50'
                  : 'text-slate-700 hover:bg-gray-50'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Session card ───────────────────────────────────────────────────────────
function SessionCard({ session, goalMap, onStart, onDelete, onTogglePriority, updateStatus, dragListeners, dragAttributes, isDragging }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const c = SESSION_COLORS[session.session_type] || DEFAULT_COLOR
  const goalText  = session.goal_id ? goalMap[session.goal_id] : null
  const typeLabel = session.session_type === 'mindfulness' && session.practice_type
    ? (PRACTICE_TYPE_LABELS[session.practice_type] ?? 'Mindfulness')
    : session.session_type?.replace(/_/g, ' ') ?? 'session'
  const isDone    = session.status === 'complete'
  const isUser    = session.source === 'user'

  let borderHighlight = c.border
  let bgHighlight = c.bg
  if (updateStatus === 'success') {
    borderHighlight = 'border-green-400'
    bgHighlight = 'bg-green-50'
  } else if (updateStatus === 'error') {
    borderHighlight = 'border-red-400'
    bgHighlight = 'bg-red-50'
  }

  const cardBorder = isUser ? `border-y border-r border-l-4 ${borderHighlight} border-l-slate-400` : `border ${borderHighlight}`

  return (
    <div className={`rounded-xl ${cardBorder} p-3 ${bgHighlight} ${isDone ? 'opacity-60' : ''} ${isDragging ? 'opacity-40' : ''}`}>
      <div className="flex items-start justify-between gap-1 mb-2">
        <div className="flex items-center gap-1.5 flex-grow">
          {!isDone && (
            <div {...dragListeners} {...dragAttributes} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 touch-none p-1 -ml-1 outline-none">
              <svg width="8" height="14" viewBox="0 0 8 14" fill="currentColor">
                <circle cx="2" cy="2" r="1.5" /><circle cx="6" cy="2" r="1.5" />
                <circle cx="2" cy="7" r="1.5" /><circle cx="6" cy="7" r="1.5" />
                <circle cx="2" cy="12" r="1.5" /><circle cx="6" cy="12" r="1.5" />
              </svg>
            </div>
          )}
          <span className={`text-xs font-semibold capitalize px-2 py-0.5 rounded-full text-white ${c.badge}`}>
            {typeLabel}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isDone && <span className="text-xs text-gray-500 font-medium">✓ done</span>}
          {!isDone && (
            <button
              onClick={e => { e.stopPropagation(); onTogglePriority(session.id, session.date) }}
              className={`p-1 rounded-md transition-colors ${session.is_priority ? 'text-teal-500' : 'text-gray-300 hover:text-gray-400'}`}
              aria-label={session.is_priority ? 'Remove priority' : 'Set as priority'}
            >
              {session.is_priority ? '★' : '☆'}
            </button>
          )}
          {!isDone && <OverflowMenu items={[{ label: 'Remove from plan', onClick: () => setConfirmDelete(true), danger: true }]} />}
        </div>
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

      {session.session_type === 'mindfulness' ? (() => {
        const mp = MINDFULNESS_PRACTICES[session.practice_type]
        return (
          <div className="mb-2 space-y-1">
            {mp?.duration_mins && (
              <p className="text-xs text-teal-700 font-medium">
                🧘 {mp.duration_mins} min · {PRACTICE_TYPE_LABELS[session.practice_type] ?? 'Mindfulness'}
              </p>
            )}
            {mp?.brief_description && (
              <p className="text-xs text-gray-500 leading-relaxed line-clamp-3">
                {mp.brief_description}
              </p>
            )}
            {!mp && session.practice_type && (
              <p className="text-xs text-gray-500">
                {PRACTICE_TYPE_LABELS[session.practice_type] ?? session.practice_type}
              </p>
            )}
          </div>
        )
      })() : session.exercises_json?.length > 0 && (
        <div className="mb-2 space-y-0.5">
          {session.exercises_json.map((ex, i) => (
            <p key={i} className="text-xs text-gray-500">
              {ex.exercise_name ?? ex.name ?? 'Exercise'} — {ex.sets} × {ex.reps}
            </p>
          ))}
        </div>
      )}

      {goalText && (
        <div className="flex items-start gap-1 mt-1 mb-2">
          <span className="text-xs text-gray-400 shrink-0">🎯</span>
          <span className="text-xs text-gray-500 leading-tight line-clamp-2">{goalText}</span>
        </div>
      )}

      {!isDone && !confirmDelete && (
        <button
          onClick={onStart}
          className="mt-2 w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-xs font-bold py-2 rounded-lg transition-colors"
        >
          ▶ Start
        </button>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mt-2 pt-2 border-t border-white/50 flex items-center justify-between gap-2">
          <p className="text-xs text-gray-600 leading-snug">Remove this session from your plan?</p>
          <div className="flex gap-1.5 shrink-0">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2 py-1 rounded-lg bg-white/70 hover:bg-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onDelete(session.id)}
              className="text-xs text-white bg-red-500 hover:bg-red-600 font-medium px-2.5 py-1 rounded-lg transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function SortableSessionCard({ session, goalMap, onStart, onDelete, onTogglePriority, updateStatus }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: session.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <SessionCard 
        session={session} 
        goalMap={goalMap} 
        onStart={onStart} 
        onDelete={onDelete} 
        onTogglePriority={onTogglePriority} 
        updateStatus={updateStatus} 
        dragListeners={listeners}
        dragAttributes={attributes}
        isDragging={isDragging} 
      />
    </div>
  )
}

function DroppableDayColumn({ id, date, isToday, isPast, label, sessions, goalMap, navigate, handleDeleteSession, handleTogglePriority, updateStatuses }) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div ref={setNodeRef} className={`flex flex-col gap-2 min-w-0 rounded-xl transition-colors ${isToday ? 'bg-slate-50/80 -m-1.5 p-1.5 ring-1 ring-slate-100' : ''} ${isOver ? 'bg-teal-50/80 ring-1 ring-teal-100 -m-1.5 p-1.5' : ''}`}>
      {/* Day header */}
      <div className={`text-center py-2 rounded-xl text-sm ${
        isToday
          ? 'bg-teal-600 text-white font-bold'
          : isPast
            ? 'text-gray-400 font-medium'
            : 'text-gray-700 font-medium'
      }`}>
        <div className="text-xs uppercase tracking-wide opacity-75">{label}</div>
        <div className="text-base font-bold leading-tight">
          {new Date(date).getUTCDate()}
        </div>
      </div>

      <SortableContext items={sessions.map(s => s.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-2 min-h-[64px]">
          {sessions.map(s => (
            <SortableSessionCard 
              key={s.id} 
              session={s} 
              goalMap={goalMap} 
              onStart={() => navigate(loggerPath(s))} 
              onDelete={handleDeleteSession} 
              onTogglePriority={handleTogglePriority} 
              updateStatus={updateStatuses[s.id]} 
            />
          ))}
          {sessions.length === 0 && (
            <div className="h-16 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center">
              <span className="text-xs text-gray-300">Rest</span>
            </div>
          )}
        </div>
      </SortableContext>
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
  const [programme, setProgramme]   = useState(null) // active programme row
  const [blockMeta, setBlockMeta]   = useState(null) // { phase_aim, session_allocation_rationale }

  const [activeId, setActiveId] = useState(null)
  const [updateStatuses, setUpdateStatuses] = useState({})
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', date: localDateStr(), duration: 45, notes: '' })

  const isDesktop = typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  const [isMd, setIsMd] = useState(isDesktop)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const handler = e => setIsMd(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const weekDates = getWeekDates(weekOffset)
  const today     = localDateStr()

  // ── Block review card detection ────────────────────────────────────────────
  // Show if today is the last day of a 2-week block (day 14, 28, 42, …)
  // and the user hasn't already responded to this block's review.
  const blockReviewInfo = (() => {
    if (!programme?.start_date) return null
    const startMs    = new Date(programme.start_date).getTime()
    const todayMs    = new Date(today).getTime()
    const dayNumber  = Math.floor((todayMs - startMs) / 86400000) + 1
    if (dayNumber <= 0 || dayNumber % 14 !== 0) return null
    const blockNum   = Math.ceil(dayNumber / 14)
    const reviewed   = programme.block_review_status ?? {}
    if (reviewed[String(blockNum)]) return null  // already responded
    return { blockNumber: blockNum, programmeId: programme.id }
  })()

  const load = useCallback(async () => {
    setLoading(true)
    const dates = getWeekDates(weekOffset)

    const [sessRes, goalsRes, progRes] = await Promise.all([
      supabase
        .from('sessions_planned')
        .select('id, date, session_type, practice_type, title, duration_mins, purpose_note, goal_id, status, exercises_json, is_priority, source')
        .eq('user_id', userId)
        .gte('date', dates[0])
        .lte('date', dates[6])
        .order('date', { ascending: true }),

      supabase
        .from('goals')
        .select('id, goal_statement')
        .eq('user_id', userId),

      supabase
        .from('programmes')
        .select('id, start_date, block_review_status, programme_aim, capability_gap_profile_json')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle(),
    ])

    const map = {}
    for (const g of goalsRes.data ?? []) map[g.id] = g.goal_statement
    setSessions(sessRes.data ?? [])
    setGoalMap(map)

    const prog = progRes.data ?? null
    setProgramme(prog)

    // Fetch phase_aim + session_allocation_rationale for the current block
    let meta = null
    if (prog?.id && prog?.start_date) {
      const startMs   = new Date(prog.start_date).getTime()
      const todayMs   = new Date(localDateStr()).getTime()
      const dayNumber = Math.floor((todayMs - startMs) / 86400000) + 1
      const blockNum  = Math.max(Math.ceil(dayNumber / 14), 1)

      const { data: blockRow } = await supabase
        .from('programme_sessions')
        .select('phase_aim, session_allocation_rationale')
        .eq('programme_id', prog.id)
        .eq('block_number', blockNum)
        .not('phase_aim', 'is', null)
        .limit(1)
        .maybeSingle()

      if (blockRow) meta = blockRow
    }
    setBlockMeta(meta)

    setLoading(false)
  }, [userId, weekOffset])

  useEffect(() => { load() }, [load])

  function handleDragStart(event) {
    setActiveId(event.active.id)
  }

  async function handleDragEnd(event) {
    const { active, over } = event
    setActiveId(null)
    if (!over) return

    const sessionId = active.id
    let targetDate = over.id
    if (!DAY_LABELS.includes(targetDate) && !targetDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const targetSession = sessions.find(s => s.id === over.id)
      if (targetSession) targetDate = targetSession.date
    }
    
    const activeSession = sessions.find(s => s.id === sessionId)
    if (!activeSession || activeSession.date === targetDate) return

    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, date: targetDate } : s))

    const { error } = await supabase.from('sessions_planned').update({ date: targetDate }).eq('id', sessionId)
    if (error) {
       setUpdateStatuses(prev => ({ ...prev, [sessionId]: 'error' }))
       setTimeout(() => setUpdateStatuses(prev => ({ ...prev, [sessionId]: null })), 2000)
       await load()
    } else {
       setUpdateStatuses(prev => ({ ...prev, [sessionId]: 'success' }))
       setTimeout(() => setUpdateStatuses(prev => ({ ...prev, [sessionId]: null })), 2000)
    }
  }

  async function handleAddSession() {
    if (!addForm.name) return
    const newSession = {
      user_id: userId,
      session_type: addForm.name.toLowerCase().replace(/\s+/g, '_'),
      title: addForm.name,
      date: addForm.date,
      duration_mins: parseInt(addForm.duration) || null,
      purpose_note: addForm.notes || null,
      source: 'user',
      status: 'planned'
    }
    const { error } = await supabase.from('sessions_planned').insert(newSession)
    if (!error) {
       setShowAddModal(false)
       setAddForm({ name: '', date: today, duration: 45, notes: '' })
       load()
    } else {
       alert('Failed to save session')
    }
  }

  // Toggle priority on a planned session for a given date
  async function handleTogglePriority(sessionId, date) {
    await supabase.from('sessions_planned').update({ is_priority: false }).eq('user_id', userId).eq('date', date)
    const s = sessions.find(s => s.id === sessionId)
    if (!s.is_priority) {
      await supabase.from('sessions_planned').update({ is_priority: true }).eq('id', sessionId)
    }
    await load()
  }

  // Delete a planned session
  async function handleDeleteSession(sessionId) {
    setSessions(prev => prev.filter(s => s.id !== sessionId))
    // Clear FK reference in programme_sessions first (prevents 23503 constraint violation)
    await supabase
      .from('programme_sessions')
      .update({ sessions_planned_id: null, status: 'planned' })
      .eq('sessions_planned_id', sessionId)
    const { error } = await supabase.from('sessions_planned').delete().eq('id', sessionId)
    if (error) {
      console.error('delete session error:', error)
      load() // re-fetch to restore true state if delete failed
    }
  }

  // ── Block review handlers ──────────────────────────────────────────────────
  // BlockReviewCard handles all DB writes (block_review_status + duplicateBlock).
  // These handlers only update local programme state so blockReviewInfo
  // recalculates to null and the card disappears immediately.

  function handleBlockProgress(blockNumber) {
    setProgramme(prev => {
      if (!prev) return prev
      const updated = { ...(prev.block_review_status ?? {}), [String(blockNumber)]: 'progress' }
      return { ...prev, block_review_status: updated }
    })
  }

  function handleBlockRepeat(blockNumber) {
    setProgramme(prev => {
      if (!prev) return prev
      const updated = { ...(prev.block_review_status ?? {}), [String(blockNumber)]: 'repeat' }
      return { ...prev, block_review_status: updated }
    })
  }

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

  // ── Duplicate visible week to next week ────────────────────────────────────
  const [duplicating, setDuplicating] = useState(false)
  async function handleKeepForAnotherWeek() {
    if (!sessions.length) return
    setDuplicating(true)
    const toInsert = sessions.map(s => {
      const [y, m, d] = s.date.split('-').map(Number)
      const dateObj = new Date(y, m - 1, d)
      dateObj.setDate(dateObj.getDate() + 7)
      
      const ny = dateObj.getFullYear()
      const nm = String(dateObj.getMonth() + 1).padStart(2, '0')
      const nd = String(dateObj.getDate()).padStart(2, '0')
      const nextWeekDate = `${ny}-${nm}-${nd}`

      return {
        user_id: userId,
        session_type: s.session_type,
        practice_type: s.practice_type,
        title: s.title,
        duration_mins: s.duration_mins,
        purpose_note: s.purpose_note,
        goal_id: s.goal_id,
        exercises_json: s.exercises_json,
        source: s.source,
        status: 'planned',
        date: nextWeekDate
      }
    })
    
    await supabase.from('sessions_planned').insert(toInsert)
    setDuplicating(false)
    load()
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
            <span>📅</span> Push to diary
          </button>
          <button
            onClick={handleKeepForAnotherWeek}
            disabled={sessions.length === 0 || duplicating}
            className="flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 text-gray-700 text-sm font-medium px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <span>🔄</span> Keep this programme for another week
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <span>+</span> Add session
          </button>
          <button
            onClick={() => navigate('/chat/rex')}
            className="flex items-center gap-1.5 bg-[#1A3A5C] hover:bg-[#0f2540] text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            <span className="w-5 h-5 rounded-full bg-[#0f2540] flex items-center justify-center text-xs font-bold">R</span>
            Build next block
          </button>
        </div>
      </div>

      {/* ── Block review card — shown on last day of each 2-week block ─────── */}
      {weekOffset === 0 && blockReviewInfo && (
        <BlockReviewCard
          blockNumber={blockReviewInfo.blockNumber}
          programmeId={blockReviewInfo.programmeId}
          onProgress={() => handleBlockProgress(blockReviewInfo.blockNumber)}
          onRepeat={() => handleBlockRepeat(blockReviewInfo.blockNumber)}
        />
      )}

      {/* ── How Rex built this — only for programmes built with the new system */}
      {programme?.programme_aim && (
        <div className="mb-5">
          <ProgrammeSummaryCollapsible
            programmeAim={programme.programme_aim}
            phaseAim={blockMeta?.phase_aim ?? null}
            sessionAllocationRationale={blockMeta?.session_allocation_rationale ?? null}
            capabilityGapProfile={programme.capability_gap_profile_json ?? null}
          />
        </div>
      )}

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

      {/* ── Calendar grid ──────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
            {isMd ? (
              <div className="grid grid-cols-7 gap-2">
                {weekDates.map((date, i) => (
                  <DroppableDayColumn
                    key={date}
                    id={date}
                    date={date}
                    label={DAY_LABELS[i]}
                    isToday={date === today}
                    isPast={date < today}
                    sessions={byDate[date] ?? []}
                    goalMap={goalMap}
                    navigate={navigate}
                    handleDeleteSession={handleDeleteSession}
                    handleTogglePriority={handleTogglePriority}
                    updateStatuses={updateStatuses}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-4">
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
                        <div className="pl-10">
                          <DroppableDayColumn
                            id={date}
                            date={date}
                            label={DAY_LABELS[i]}
                            isToday={false}
                            isPast={false}
                            sessions={daySessions}
                            goalMap={goalMap}
                            navigate={navigate}
                            handleDeleteSession={handleDeleteSession}
                            handleTogglePriority={handleTogglePriority}
                            updateStatuses={updateStatuses}
                          />
                        </div>
                      ) : (
                        <div className="pl-10">
                          <DroppableDayColumn
                            id={date}
                            date={date}
                            label={DAY_LABELS[i]}
                            isToday={false}
                            isPast={false}
                            sessions={[]}
                            goalMap={goalMap}
                            navigate={navigate}
                            handleDeleteSession={handleDeleteSession}
                            handleTogglePriority={handleTogglePriority}
                            updateStatuses={updateStatuses}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
            
            <DragOverlay>
              {activeId ? (
                <SessionCard 
                  session={sessions.find(s => s.id === activeId)} 
                  goalMap={goalMap} 
                  onStart={() => {}} 
                  onDelete={() => {}} 
                  onTogglePriority={() => {}} 
                  updateStatus={null}
                  isDragging={false} 
                />
              ) : null}
            </DragOverlay>
          </DndContext>

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

      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-slate-50">
               <h2 className="font-bold text-gray-800">Add Session</h2>
               <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-5 space-y-4">
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Session Name</label>
                  <input type="text" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" placeholder="e.g. Run, Swim, Walk, Yoga" value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
               </div>
               <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Day</label>
                    <input type="date" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={addForm.date} onChange={e => setAddForm({...addForm, date: e.target.value})} />
                 </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Duration (min)</label>
                    <input type="number" className="w-full border border-gray-300 rounded-lg p-2.5 text-sm" value={addForm.duration} onChange={e => setAddForm({...addForm, duration: e.target.value})} />
                 </div>
               </div>
               <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
                  <textarea className="w-full border border-gray-300 rounded-lg p-2.5 text-sm h-20 resize-none" placeholder="Anything you want Rex or Fitz to know" value={addForm.notes} onChange={e => setAddForm({...addForm, notes: e.target.value})} />
               </div>
            </div>
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
               <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
               <button onClick={handleAddSession} disabled={!addForm.name} className="px-4 py-2 text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
