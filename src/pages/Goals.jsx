import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Domain config ─────────────────────────────────────────────────────────────
const DOMAIN = {
  physical: {
    label: 'Roots',
    icon: '🌱',
    badge: 'bg-teal-100 text-teal-700 border-teal-200',
    bar: 'bg-teal-500',
    check: 'bg-teal-500 border-teal-500',
    line: 'The foundation of your physical wellbeing.',
  },
  emotional: {
    label: 'Leaves',
    icon: '💙',
    badge: 'bg-blue-100 text-blue-700 border-blue-200',
    bar: 'bg-blue-500',
    check: 'bg-blue-500 border-blue-500',
    line: 'Nurturing your inner landscape.',
  },
  social: {
    label: 'Canopy',
    icon: '🌞',
    badge: 'bg-amber-100 text-amber-700 border-amber-200',
    bar: 'bg-amber-500',
    check: 'bg-amber-500 border-amber-500',
    line: 'Growing your connections with others.',
  },
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }) {
  const styles = {
    active:   'bg-teal-100 text-teal-700 border-teal-200',
    achieved: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    archived: 'bg-gray-100 text-gray-500 border-gray-200',
  }
  const labels = { active: 'Active', achieved: 'Achieved', archived: 'Archived' }
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full border ${styles[status] ?? styles.archived}`}>
      {labels[status] ?? status}
    </span>
  )
}

// ── Overflow menu ─────────────────────────────────────────────────────────────
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
        className="p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
        aria-label="More options"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
          <circle cx="7" cy="2"   r="1.4" />
          <circle cx="7" cy="7"   r="1.4" />
          <circle cx="7" cy="12" r="1.4" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[170px]">
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

// ── Milestone checkbox ────────────────────────────────────────────────────────
function MilestoneRow({ milestone, domain, onToggle, disabled }) {
  const d = DOMAIN[domain] ?? DOMAIN.physical
  return (
    <div className="flex items-start gap-2">
      <button
        disabled={disabled}
        onClick={() => onToggle(milestone)}
        className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
          milestone.completed
            ? d.check
            : 'border-gray-300 bg-white hover:border-gray-400'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        {milestone.completed && (
          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
            <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      <p className={`text-xs leading-relaxed ${milestone.completed ? 'text-gray-400 line-through' : 'text-slate-600'}`}>
        {milestone.text}
      </p>
    </div>
  )
}

// ── Goal card ─────────────────────────────────────────────────────────────────
function GoalCard({ goal, onMilestoneToggle, onArchive, onRestore, onDelete, onMarkAchieved, navigate }) {
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isAchieved = goal.status === 'achieved'
  const isArchived = goal.status === 'archived'
  const d = DOMAIN[goal.domain] ?? DOMAIN.physical
  const milestones = goal.milestones ?? []
  const legacyItems = Array.isArray(goal.milestones_json) ? goal.milestones_json : []
  const hasLegacy = milestones.length === 0 && legacyItems.length > 0

  const total     = milestones.length
  const completed = milestones.filter(m => m.completed).length
  const allDone   = total > 0 && completed === total

  const coachPath  = goal.coach === 'rex' ? '/chat/rex' : '/chat/fitz'
  const coachName  = goal.coach === 'rex' ? 'Rex' : 'Fitz'
  const coachColor = goal.coach === 'rex'
    ? 'text-slate-600 hover:text-slate-800'
    : 'text-teal-600 hover:text-teal-800'

  // Build menu items based on current status
  const menuItems = []
  if (goal.status === 'active') {
    menuItems.push({ label: '✓ Mark as achieved', onClick: () => onMarkAchieved(goal.id) })
    menuItems.push({ label: 'Archive goal',        onClick: () => onArchive(goal.id) })
  }
  if (goal.status === 'achieved') {
    menuItems.push({ label: 'Move back to active', onClick: () => onRestore(goal.id) })
    menuItems.push({ label: 'Archive goal',        onClick: () => onArchive(goal.id) })
  }
  if (goal.status === 'archived') {
    menuItems.push({ label: 'Restore goal',        onClick: () => onRestore(goal.id) })
  }
  menuItems.push({ label: 'Delete permanently', onClick: () => setConfirmDelete(true), danger: true })

  return (
    <div className={`rounded-2xl border shadow-sm p-5 ${
      isAchieved ? 'bg-emerald-50 border-emerald-100'
      : isArchived ? 'bg-gray-50 border-gray-200 opacity-75'
      : 'bg-white border-gray-100'
    }`}>

      {/* Domain badge + menu */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border shrink-0 ${d.badge}`}>
            {d.icon} {d.label}
          </span>
          <span className="text-xs text-gray-400 truncate">{d.line}</span>
        </div>
        <OverflowMenu items={menuItems} />
      </div>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className={`text-sm font-semibold leading-snug flex-1 ${
          isAchieved ? 'text-emerald-800' : isArchived ? 'text-gray-500' : 'text-slate-800'
        }`}>
          {goal.goal_statement}
        </p>
        <StatusPill status={goal.status} />
      </div>

      {/* Achievement date */}
      {isAchieved && goal.last_reviewed_at && (
        <p className="text-xs text-emerald-600 mb-3">
          ✓ Achieved {fmtDate(goal.last_reviewed_at)}
        </p>
      )}

      {/* Interactive milestones */}
      {milestones.length > 0 && (
        <div className="mb-4 space-y-2">
          {milestones.map(m => (
            <MilestoneRow
              key={m.id}
              milestone={m}
              domain={goal.domain}
              onToggle={(m) => onMilestoneToggle(m, goal.domain)}
              disabled={isAchieved || isArchived}
            />
          ))}
        </div>
      )}

      {/* Legacy milestones */}
      {hasLegacy && (
        <div className="mb-4 space-y-2">
          <p className="text-xs text-gray-400 italic mb-1">
            These steps were set before individual tracking was available.
          </p>
          {legacyItems.map((m, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-0.5 w-4 h-4 flex-shrink-0 rounded border border-gray-300 bg-white" />
              <p className="text-xs text-slate-600 leading-relaxed">
                {typeof m === 'string' ? m : m.text ?? m.description ?? JSON.stringify(m)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Progress bar */}
      {total > 0 && (
        <div className="mb-4">
          {allDone ? (
            <p className="text-xs font-medium text-emerald-600 mb-1">🎉 All steps complete!</p>
          ) : (
            <p className="text-xs text-gray-400 mb-1">{completed} of {total} steps complete</p>
          )}
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${d.bar}`}
              style={{ width: `${total > 0 ? (completed / total) * 100 : 0}%` }}
            />
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete ? (
        <div className="mt-3 pt-3 border-t border-red-100 flex items-center justify-between gap-3">
          <p className="text-xs text-red-600 leading-snug">Delete this goal and all its milestones permanently?</p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 hover:text-gray-700 font-medium px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => onDelete(goal.id)}
              className="text-xs text-white bg-red-500 hover:bg-red-600 font-medium px-3 py-1 rounded-lg transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      ) : (
        /* Footer */
        <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
          {goal.last_reviewed_at && !isAchieved ? (
            <p className="text-xs text-gray-400">Last reviewed {fmtDate(goal.last_reviewed_at)}</p>
          ) : goal.created_at && !isAchieved ? (
            <p className="text-xs text-gray-400">Added {fmtDate(goal.created_at)}</p>
          ) : (
            <span />
          )}
          {!isArchived && (
            <button
              onClick={() => navigate(coachPath, { state: { initialMessage: `I'd like to talk about my goal: "${goal.goal_statement}"` } })}
              className={`text-xs font-semibold transition-colors ${coachColor}`}
            >
              Talk to {coachName} →
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Suggest new goal panel ────────────────────────────────────────────────────
function SuggestPanel({ onDismiss, navigate }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm font-semibold text-slate-800">Who would you like to set a new goal with?</p>
        <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 transition-colors ml-3 flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Your coach will help you shape and save the goal through your conversation.
      </p>
      <div className="flex gap-3">
        <button
          onClick={() => navigate('/chat/fitz', { state: { initialMessage: "I'd like to set a new goal. Can you help me?" } })}
          className="flex-1 bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          Fitz
        </button>
        <button
          onClick={() => navigate('/chat/rex', { state: { initialMessage: "I'd like to set a new goal. Can you help me?" } })}
          className="flex-1 bg-slate-700 hover:bg-slate-800 active:bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          Rex
        </button>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Goals() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const userId      = session.user.id

  const [goals,        setGoals]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [showSuggest,  setShowSuggest]  = useState(false)
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: goalsData } = await supabase
        .from('goals')
        .select('id, goal_statement, status, domain, coach, milestones_json, created_at, last_reviewed_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })

      if (!goalsData) { setLoading(false); return }

      const goalIds = goalsData.map(g => g.id)
      let milestoneMap = {}

      if (goalIds.length > 0) {
        const { data: msData } = await supabase
          .from('goal_milestones')
          .select('id, goal_id, text, order_index, completed, completed_at')
          .in('goal_id', goalIds)
          .order('order_index', { ascending: true })

        if (msData) {
          for (const m of msData) {
            if (!milestoneMap[m.goal_id]) milestoneMap[m.goal_id] = []
            milestoneMap[m.goal_id].push(m)
          }
        }
      }

      setGoals(goalsData.map(g => ({ ...g, milestones: milestoneMap[g.id] ?? [] })))
      setLoading(false)
    }
    load()
  }, [userId])

  // ── Milestone toggle ────────────────────────────────────────────────────────
  const handleMilestoneToggle = useCallback(async (milestone, domain) => {
    const newCompleted = !milestone.completed

    setGoals(prev => prev.map(g => ({
      ...g,
      milestones: g.milestones.map(m =>
        m.id === milestone.id
          ? { ...m, completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null }
          : m
      ),
    })))

    const { error } = await supabase
      .from('goal_milestones')
      .update({ completed: newCompleted, completed_at: newCompleted ? new Date().toISOString() : null })
      .eq('id', milestone.id)

    if (error) {
      setGoals(prev => prev.map(g => ({
        ...g,
        milestones: g.milestones.map(m => m.id === milestone.id ? milestone : m),
      })))
      return
    }

    const { error: rpcError } = await supabase.rpc('nudge_tree_score', {
      p_user_id: userId,
      p_domain:  domain,
      p_delta:   newCompleted ? 2 : -2,
    })
    if (rpcError) console.error('nudge_tree_score failed:', rpcError)
  }, [userId])

  // ── Goal status updates ─────────────────────────────────────────────────────
  async function updateGoalStatus(goalId, newStatus) {
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, status: newStatus } : g))
    const { error } = await supabase.from('goals').update({ status: newStatus }).eq('id', goalId)
    if (error) {
      // Revert on failure — re-fetch to get true state
      const { data } = await supabase.from('goals').select('status').eq('id', goalId).single()
      if (data) setGoals(prev => prev.map(g => g.id === goalId ? { ...g, status: data.status } : g))
    }
  }

  const handleMarkAchieved = (id) => updateGoalStatus(id, 'achieved')
  const handleArchive      = (id) => updateGoalStatus(id, 'archived')
  const handleRestore      = (id) => updateGoalStatus(id, 'active')

  async function handleDeleteGoal(goalId) {
    setGoals(prev => prev.filter(g => g.id !== goalId))
    const { error } = await supabase.from('goals').delete().eq('id', goalId)
    if (error) {
      console.error('delete goal error:', error)
      // Re-fetch to restore if delete failed
      const { data } = await supabase
        .from('goals')
        .select('id, goal_statement, status, domain, coach, milestones_json, created_at, last_reviewed_at')
        .eq('id', goalId)
        .single()
      if (data) setGoals(prev => [data, ...prev])
    }
  }

  // ── Filtered view ───────────────────────────────────────────────────────────
  const visibleGoals  = goals.filter(g => g.status !== 'archived')
  const archivedGoals = goals.filter(g => g.status === 'archived')

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-12">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Your Goals</h1>
          <p className="text-sm text-gray-400 mt-0.5">Set and shaped through your coaching conversations.</p>
        </div>
        <button
          onClick={() => setShowSuggest(s => !s)}
          className="flex-shrink-0 flex items-center gap-1.5 text-sm font-semibold text-teal-600 hover:text-teal-800 transition-colors"
        >
          <span className="text-lg leading-none">+</span> Suggest a new goal
        </button>
      </div>

      {showSuggest && (
        <div className="mb-4">
          <SuggestPanel onDismiss={() => setShowSuggest(false)} navigate={navigate} />
        </div>
      )}

      {visibleGoals.length === 0 && archivedGoals.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
          <p className="text-sm text-gray-400 leading-relaxed mb-5">
            Your goals will appear here after your first coaching conversation with Fitz.
          </p>
          <button
            onClick={() => navigate('/chat/fitz')}
            className="bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold text-sm px-6 py-3 rounded-xl transition-colors"
          >
            Talk to Fitz
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGoals.map(g => (
            <GoalCard
              key={g.id}
              goal={g}
              onMilestoneToggle={handleMilestoneToggle}
              onArchive={handleArchive}
              onRestore={handleRestore}
              onDelete={handleDeleteGoal}
              onMarkAchieved={handleMarkAchieved}
              navigate={navigate}
            />
          ))}

          {/* Archived section */}
          {archivedGoals.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowArchived(s => !s)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <span className="font-medium">
                  {showArchived ? 'Hide' : 'Show'} archived goals ({archivedGoals.length})
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 16 16" fill="none"
                  className={`transition-transform ${showArchived ? 'rotate-180' : ''}`}
                >
                  <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {showArchived && (
                <div className="mt-3 space-y-3">
                  {archivedGoals.map(g => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      onMilestoneToggle={handleMilestoneToggle}
                      onArchive={handleArchive}
                      onRestore={handleRestore}
                      onDelete={handleDeleteGoal}
                      onMarkAchieved={handleMarkAchieved}
                      navigate={navigate}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </main>
  )
}
