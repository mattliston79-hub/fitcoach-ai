import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// ── Add your own email address here to grant admin access ────────────────
const ADMIN_EMAILS = ['mattliston79@gmail.com']

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-1">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-800 leading-none">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

export default function Admin() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userEmail = session?.user?.email

  const [stats, setStats]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState('')

  // Access check — redirect non-admins immediately
  useEffect(() => {
    if (!ADMIN_EMAILS.includes(userEmail)) {
      navigate('/dashboard', { replace: true })
    }
  }, [userEmail, navigate])

  useEffect(() => {
    if (!ADMIN_EMAILS.includes(userEmail)) return

    async function load() {
      try {
        const [
          usersRes,
          goalsRes,
          sessionsPlannedRes,
          sessionsLoggedRes,
          wellbeingRes,
          recoveryRes,
          badgesRes,
          activityTypesRes,
          recentUsersRes,
        ] = await Promise.all([
          supabase.from('users').select('id, name, created_at', { count: 'exact' }),
          supabase.from('goals').select('id, status', { count: 'exact' }),
          supabase.from('sessions_planned').select('id, session_type', { count: 'exact' }),
          supabase.from('sessions_logged').select('id, session_type, date', { count: 'exact' }),
          supabase.from('wellbeing_logs').select('id', { count: 'exact' }),
          supabase.from('recovery_logs').select('id, energy_score, soreness_score', { count: 'exact' }),
          supabase.from('user_badges').select('id', { count: 'exact' }),
          supabase.from('sessions_logged').select('session_type'),
          supabase
            .from('users')
            .select('name, email, created_at')
            .order('created_at', { ascending: false })
            .limit(10),
        ])

        // Count activity types from logged sessions
        const typeCounts = {}
        for (const s of activityTypesRes.data ?? []) {
          const t = s.session_type ?? 'unknown'
          typeCounts[t] = (typeCounts[t] || 0) + 1
        }
        const sortedTypes = Object.entries(typeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)

        // Average energy and soreness
        const recLogs = recoveryRes.data ?? []
        const avgEnergy   = recLogs.length ? (recLogs.reduce((s, r) => s + (r.energy_score ?? 0), 0) / recLogs.length).toFixed(1) : null
        const avgSoreness = recLogs.length ? (recLogs.reduce((s, r) => s + (r.soreness_score ?? 0), 0) / recLogs.length).toFixed(1) : null

        setStats({
          totalUsers:        usersRes.count ?? usersRes.data?.length ?? 0,
          totalGoals:        goalsRes.count ?? 0,
          activeGoals:       goalsRes.data?.filter(g => g.status === 'active').length ?? 0,
          sessionsPlanned:   sessionsPlannedRes.count ?? 0,
          sessionsLogged:    sessionsLoggedRes.count ?? 0,
          wellbeingLogs:     wellbeingRes.count ?? 0,
          recoveryLogs:      recoveryRes.count ?? 0,
          badgesEarned:      badgesRes.count ?? 0,
          avgEnergy,
          avgSoreness,
          activityTypes:     sortedTypes,
          recentUsers:       recentUsersRes.data ?? [],
        })
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [userEmail])

  if (!ADMIN_EMAILS.includes(userEmail)) return null

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  if (error) {
    return (
      <main className="max-w-4xl mx-auto px-4 py-10">
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 pb-16 space-y-8">

      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Alongside usage statistics — visible to admins only</p>
      </div>

      {/* ── Top stats grid ─────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total users"      value={stats.totalUsers} />
          <StatCard label="Sessions logged"  value={stats.sessionsLogged} />
          <StatCard label="Wellbeing logs"   value={stats.wellbeingLogs} />
          <StatCard label="Badges earned"    value={stats.badgesEarned} />
        </div>
      </section>

      {/* ── Goals ──────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Goals</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total goals"    value={stats.totalGoals} />
          <StatCard label="Active goals"   value={stats.activeGoals} />
          <StatCard label="Sessions planned" value={stats.sessionsPlanned} />
        </div>
      </section>

      {/* ── Recovery averages ──────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Recovery (all users, all time)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Recovery logs"    value={stats.recoveryLogs} />
          <StatCard label="Avg energy score" value={stats.avgEnergy}    sub="out of 5" />
          <StatCard label="Avg soreness"     value={stats.avgSoreness}  sub="out of 5" />
        </div>
      </section>

      {/* ── Activity types ─────────────────────────────────────────── */}
      {stats.activityTypes.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Most logged activity types
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {stats.activityTypes.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {type.replace(/_/g, ' ')}
                </span>
                <span className="text-sm text-gray-400 font-medium">{count} sessions</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Recent sign-ups ────────────────────────────────────────── */}
      {stats.recentUsers.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Recent sign-ups (last 10)
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {stats.recentUsers.map((u, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-700">{u.name || '—'}</p>
                  <p className="text-xs text-gray-400">{u.email}</p>
                </div>
                <span className="text-xs text-gray-400">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short', year: 'numeric'
                  }) : '—'}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

    </main>
  )
}
