import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = { 0: 'Su', 1: 'Mo', 2: 'Tu', 3: 'We', 4: 'Th', 5: 'Fr', 6: 'Sa' }

const SESSION_TYPE_LABELS = {
  kettlebell:      'Kettlebell',
  hiit_bodyweight: 'HIIT',
  yoga:            'Yoga',
  pilates:         'Pilates',
  plyometrics:     'Plyometrics',
  coordination:    'Coordination',
  flexibility:     'Flexibility',
  gym_strength:    'Gym Strength',
}

const EXPERIENCE_LABELS = {
  novice:       'Novice',
  intermediate: 'Intermediate',
  advanced:     'Advanced',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">{title}</h2>
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div className="px-4 py-3.5 flex items-start justify-between gap-4">
      <p className="text-sm text-gray-500 shrink-0 mt-0.5">{label}</p>
      <p className="text-sm font-medium text-slate-800 text-right leading-snug">{value || '—'}</p>
    </div>
  )
}

function Toggle({ label, description, checked, onChange, disabled }) {
  return (
    <div className={`px-4 py-3.5 flex items-center justify-between gap-4 ${disabled ? 'opacity-40' : ''}`}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none ${
          checked ? 'bg-teal-500' : 'bg-gray-200'
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  )
}

function ActionRow({ label, sublabel, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`w-full px-4 py-3.5 flex items-center justify-between text-left transition-colors hover:bg-gray-50 ${
        danger ? 'text-red-500' : 'text-slate-800'
      }`}
    >
      <div>
        <p className={`text-sm font-medium ${danger ? 'text-red-500' : 'text-slate-800'}`}>{label}</p>
        {sublabel && <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>}
      </div>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-gray-300 shrink-0">
        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  )
}

// ── Confirmation dialog ───────────────────────────────────────────────────────

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
        <p className="text-sm text-slate-700 leading-relaxed">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Profile() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const userId      = session.user.id
  const userEmail   = session.user.email

  const [loading,  setLoading]  = useState(true)
  const [userData, setUserData] = useState(null)
  const [profile,  setProfile]  = useState(null)
  const [saving,   setSaving]   = useState(false)
  const [confirm,  setConfirm]  = useState(null) // null | 'reset'

  useEffect(() => {
    async function load() {
      const [userRes, profileRes] = await Promise.all([
        supabase.from('users').select('name, email').eq('id', userId).single(),
        supabase.from('user_profiles').select(
          'experience_level, goals_summary, preferred_session_types, available_days, ' +
          'pre_session_notif_enabled, post_session_notif_enabled, ' +
          'weekly_review_notif_enabled, master_notifications_enabled'
        ).eq('user_id', userId).single(),
      ])
      setUserData(userRes.data)
      setProfile(profileRes.data ?? {})
      setLoading(false)
    }
    load()
  }, [userId])

  const updateNotif = useCallback(async (field, value) => {
    if (saving) return
    setSaving(true)
    setProfile(prev => ({ ...prev, [field]: value }))
    await supabase.from('user_profiles').update({ [field]: value }).eq('user_id', userId)
    setSaving(false)
  }, [userId, saving])

  const handleReset = async () => {
    setConfirm(null)
    await supabase.from('users').update({ onboarding_complete: false }).eq('id', userId)
    navigate('/onboarding')
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return (
      <main className="max-w-lg mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  const masterOn   = profile?.master_notifications_enabled !== false
  const dayInitials = (profile?.available_days ?? [])
    .sort((a, b) => a - b)
    .map(d => DAY_LABELS[d] ?? d)
    .join('  ')

  const sessionTags = (profile?.preferred_session_types ?? [])
    .map(t => SESSION_TYPE_LABELS[t] ?? t)
    .join(', ')

  return (
    <>
      <main className="max-w-lg mx-auto px-4 py-6 pb-16">

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Profile</h1>
          <p className="text-sm text-gray-400 mt-0.5">Your account and preferences.</p>
        </div>

        {/* 1. YOUR INFO */}
        <Section title="Your Info">
          <Row label="Name"  value={userData?.name  ?? '—'} />
          <Row label="Email" value={userData?.email ?? userEmail} />
        </Section>

        {/* 2. YOUR GOALS */}
        <Section title="Your Goals">
          <div className="px-4 py-3.5">
            <p className="text-sm text-slate-800 leading-relaxed mb-3">
              {profile?.goals_summary || 'No goals summary yet — talk to Fitz to set your goals.'}
            </p>
            <button
              onClick={() => navigate('/chat/fitz', { state: { initialMessage: "I'd like to review and update my goals." } })}
              className="text-sm font-semibold text-teal-600 hover:text-teal-800 transition-colors"
            >
              Update my goals →
            </button>
          </div>
        </Section>

        {/* 3. TRAINING PREFERENCES */}
        <Section title="Training Preferences">
          <Row
            label="Experience level"
            value={EXPERIENCE_LABELS[profile?.experience_level] ?? profile?.experience_level ?? '—'}
          />
          <Row
            label="Session types"
            value={sessionTags || '—'}
          />
          <Row
            label="Available days"
            value={dayInitials || '—'}
          />
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400">
              Training preferences are set during onboarding and updated by Rex when you adjust your plan.
            </p>
          </div>
        </Section>

        {/* 4. NOTIFICATIONS */}
        <Section title="Notifications">
          <Toggle
            label="Pause all"
            description="Disables all notifications"
            checked={!masterOn}
            onChange={(val) => updateNotif('master_notifications_enabled', !val)}
          />
          <Toggle
            label="Pre-session check-in"
            checked={!!profile?.pre_session_notif_enabled}
            onChange={(val) => updateNotif('pre_session_notif_enabled', val)}
            disabled={!masterOn}
          />
          <Toggle
            label="Post-session debrief"
            checked={!!profile?.post_session_notif_enabled}
            onChange={(val) => updateNotif('post_session_notif_enabled', val)}
            disabled={!masterOn}
          />
          <Toggle
            label="Weekly review"
            checked={!!profile?.weekly_review_notif_enabled}
            onChange={(val) => updateNotif('weekly_review_notif_enabled', val)}
            disabled={!masterOn}
          />
        </Section>

        {/* 5. ACCOUNT */}
        <Section title="Account">
          <ActionRow
            label="Reset coaching conversation"
            sublabel="Restarts onboarding with Fitz"
            onClick={() => setConfirm('reset')}
            danger
          />
          <ActionRow
            label="Log out"
            onClick={handleLogout}
          />
        </Section>

      </main>

      {confirm === 'reset' && (
        <ConfirmDialog
          message="This will restart your onboarding conversation with Fitz. Your session history, goals, and records won't be deleted. Continue?"
          onConfirm={handleReset}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}
