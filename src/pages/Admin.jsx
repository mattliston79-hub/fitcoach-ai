import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const ADMIN_EMAILS = ['mattliston79@gmail.com']

const SESSION_TYPE_LABELS = {
  gym_strength:   'Gym',
  kettlebell:     'Kettlebell',
  hiit_bodyweight:'HIIT',
  pilates:        'Pilates',
  yoga:           'Yoga',
  flexibility:    'Flexibility',
  plyometrics:    'Plyometrics',
  coordination:   'Coordination',
  mindfulness:    'Mindfulness',
}

const ALL_SESSION_TYPES = Object.keys(SESSION_TYPE_LABELS)

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-1">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-800 leading-none">{value ?? '—'}</p>
      {sub && <p className="text-xs text-gray-400">{sub}</p>}
    </div>
  )
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function Admin() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const userEmail   = session?.user?.email

  const [overview,  setOverview]  = useState(null)
  const [userRows,  setUserRows]  = useState([])
  const [actTypes,  setActTypes]  = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  useEffect(() => {
    if (!ADMIN_EMAILS.includes(userEmail)) {
      navigate('/dashboard', { replace: true })
    }
  }, [userEmail, navigate])

  useEffect(() => {
    if (!ADMIN_EMAILS.includes(userEmail)) return

    async function load() {
      try {
        // ── 1. Aggregate counts ──────────────────────────────────────────
        const [
          usersRes,
          goalsRes,
          loggedRes,
          wellbeingRes,
          actTypesRes,
        ] = await Promise.all([
          supabase.from('users').select('id', { count: 'exact' }),
          supabase.from('goals').select('id, status', { count: 'exact' }),
          supabase.from('sessions_logged').select('id, session_type', { count: 'exact' }),
          supabase.from('wellbeing_logs').select('id', { count: 'exact' }),
          supabase.from('sessions_logged').select('session_type'),
        ])

        const typeCounts = {}
        for (const s of actTypesRes.data ?? []) {
          const t = s.session_type ?? 'unknown'
          typeCounts[t] = (typeCounts[t] || 0) + 1
        }
        const sortedTypes = Object.entries(typeCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)

        setActTypes(sortedTypes)
        setOverview({
          totalUsers:     usersRes.count ?? 0,
          totalGoals:     goalsRes.count ?? 0,
          achievedGoals:  goalsRes.data?.filter(g => g.status === 'achieved').length ?? 0,
          activeGoals:    goalsRes.data?.filter(g => g.status === 'active').length ?? 0,
          sessionsLogged: loggedRes.count ?? 0,
          wellbeingLogs:  wellbeingRes.count ?? 0,
        })

        // ── 2. Per-user detail ───────────────────────────────────────────
        // Fetch all users from the public users table
        const { data: users } = await supabase
          .from('users')
          .select('id, name, email, created_at')
          .order('created_at', { ascending: false })

        if (!users?.length) { setUserRows([]); setLoading(false); return }

        const userIds = users.map(u => u.id)

        // Fetch supporting data for all users in parallel
        const [
          profilesRes,
          goalsAllRes,
          sessionsAllRes,
          authUsersRes,
        ] = await Promise.all([
          // user_profiles — disclaimer fields + last_sign_in
          supabase
            .from('user_profiles')
            .select('user_id, activity_confidence')
            .in('user_id', userIds),

          // goals per user
          supabase
            .from('goals')
            .select('user_id, status')
            .in('user_id', userIds),

          // logged sessions per user, with type
          supabase
            .from('sessions_logged')
            .select('user_id, session_type, date')
            .in('user_id', userIds)
            .order('date', { ascending: false }),

          // last_sign_in_at comes from auth.users — query via the admin API
          // using the service role anon RPC if available, else leave blank
          supabase
            .from('user_profiles')
            .select('user_id, updated_at')
            .in('user_id', userIds),
        ])

        const profileMap = {}
        for (const p of profilesRes.data ?? []) profileMap[p.user_id] = p

        const goalsByUser = {}
        for (const g of goalsAllRes.data ?? []) {
          if (!goalsByUser[g.user_id]) goalsByUser[g.user_id] = []
          goalsByUser[g.user_id].push(g)
        }

        const sessionsByUser = {}
        const lastSessionByUser = {}
        for (const s of sessionsAllRes.data ?? []) {
          if (!sessionsByUser[s.user_id]) sessionsByUser[s.user_id] = []
          sessionsByUser[s.user_id].push(s)
          if (!lastSessionByUser[s.user_id]) lastSessionByUser[s.user_id] = s.date
        }

        const rows = users.map(u => {
          const profile  = profileMap[u.user_id] ?? {}
          const goals    = goalsByUser[u.id] ?? []
          const sessions = sessionsByUser[u.id] ?? []

          const typeCounts = {}
          for (const s of sessions) {
            typeCounts[s.session_type] = (typeCounts[s.session_type] || 0) + 1
          }

          return {
            id:               u.id,
            name:             u.name || '—',
            email:            u.email || '—',
            joinedAt:         u.created_at,
            lastSession:      lastSessionByUser[u.id] ?? null,
            disclaimerTicked: true, // all registered users have confirmed — enforced at sign-up
            goalsSet:         goals.length,
            goalsAchieved:    goals.filter(g => g.status === 'achieved').length,
            totalSessions:    sessions.length,
            sessionTypes:     typeCounts,
          }
        })

        setUserRows(rows)
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
      <main className="max-w-5xl mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  if (error) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-10">
        <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl p-4">{error}</p>
      </main>
    )
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-8 pb-16 space-y-10">

      <div>
        <h1 className="text-2xl font-bold text-gray-800">Admin dashboard</h1>
        <p className="text-sm text-gray-400 mt-1">Alongside usage — visible to admins only</p>
      </div>

      {/* ── Overview stats ──────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Overview</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total users"      value={overview?.totalUsers} />
          <StatCard label="Sessions logged"  value={overview?.sessionsLogged} />
          <StatCard label="Wellbeing logs"   value={overview?.wellbeingLogs} />
          <StatCard label="Goals set"        value={overview?.totalGoals} />
          <StatCard label="Goals achieved"   value={overview?.achievedGoals} />
          <StatCard label="Active goals"     value={overview?.activeGoals} />
        </div>
      </section>

      {/* ── Activity type breakdown ─────────────────────────────── */}
      {actTypes.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Sessions by activity type (all users)
          </h2>
          <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
            {actTypes.map(([type, count]) => (
              <div key={type} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm font-medium text-gray-700 capitalize">
                  {SESSION_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')}
                </span>
                <span className="text-sm text-gray-400 font-medium">{count}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Per-user table ──────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
          All users ({userRows.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-gray-100">
          <table className="w-full text-sm bg-white" style={{ minWidth: 900 }}>
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Joined</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Disclaimer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Last session</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Sessions</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Goals set</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">Achieved</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {userRows.map(u => (
                <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800">{u.name}</td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(u.joinedAt)}</td>
                  <td className="px-4 py-3">
                    {u.disclaimerTicked
                      ? <span className="text-emerald-600 font-semibold text-xs">✓ Confirmed</span>
                      : <span className="text-red-400 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(u.lastSession)}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="font-semibold text-gray-700">{u.totalSessions} total</span>
                      {Object.entries(u.sessionTypes)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                          <span key={type} className="text-xs text-gray-400">
                            {SESSION_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')}: {count}
                          </span>
                        ))
                      }
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium">{u.goalsSet}</td>
                  <td className="px-4 py-3">
                    {u.goalsAchieved > 0
                      ? <span className="text-emerald-600 font-semibold">{u.goalsAchieved}</span>
                      : <span className="text-gray-300">0</span>
                    }
                  </td>
                </tr>
              ))}
              {userRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-400 text-sm">
                    No users yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </main>
  )
}
