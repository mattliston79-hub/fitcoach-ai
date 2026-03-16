import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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

// ── Goal card ─────────────────────────────────────────────────────────────────
function GoalCard({ goal, navigate }) {
  const milestones = Array.isArray(goal.milestones_json) ? goal.milestones_json : []
  const isAchieved = goal.status === 'achieved'

  return (
    <div className={`rounded-2xl border shadow-sm p-5 ${
      isAchieved ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-gray-100'
    }`}>

      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className={`text-sm font-semibold leading-snug flex-1 ${
          isAchieved ? 'text-emerald-800' : 'text-slate-800'
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

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="mb-4 space-y-2">
          {milestones.map((m, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className={`mt-0.5 w-4 h-4 flex-shrink-0 rounded border flex items-center justify-center ${
                isAchieved
                  ? 'bg-emerald-200 border-emerald-300'
                  : 'border-gray-300 bg-white'
              }`}>
                {isAchieved && (
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <path d="M1 4L3.5 6.5L9 1" stroke="#059669" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <p className="text-xs text-slate-600 leading-relaxed">
                {typeof m === 'string' ? m : m.text ?? m.description ?? JSON.stringify(m)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
        {goal.last_reviewed_at && !isAchieved ? (
          <p className="text-xs text-gray-400">Last reviewed {fmtDate(goal.last_reviewed_at)}</p>
        ) : goal.created_at && !isAchieved ? (
          <p className="text-xs text-gray-400">Added {fmtDate(goal.created_at)}</p>
        ) : (
          <span />
        )}
        <button
          onClick={() => navigate('/chat/fitz', { state: { initialMessage: `I'd like to talk about my goal: "${goal.goal_statement}"` } })}
          className="text-xs font-semibold text-teal-600 hover:text-teal-800 transition-colors"
        >
          Talk to Fitz →
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

  const [goals,   setGoals]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('goals')
      .select('id, goal_statement, status, milestones_json, created_at, last_reviewed_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setGoals(data ?? [])
        setLoading(false)
      })
  }, [userId])

  if (loading) {
    return (
      <main className="max-w-2xl mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-6 pb-12">

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Your Goals</h1>
        <p className="text-sm text-gray-400 mt-0.5">Set and shaped through your coaching conversations.</p>
      </div>

      {goals.length === 0 ? (
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
          {goals.map(g => (
            <GoalCard key={g.id} goal={g} navigate={navigate} />
          ))}
        </div>
      )}

    </main>
  )
}
