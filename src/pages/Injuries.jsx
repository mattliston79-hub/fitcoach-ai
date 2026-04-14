import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

const SEVERITY_CONFIG = {
  mild:     { label: 'Mild',     color: '#D97706', bg: '#FEF3C7' },
  moderate: { label: 'Moderate', color: '#EA580C', bg: '#FFEDD5' },
  severe:   { label: 'Severe',   color: '#DC2626', bg: '#FEE2E2' },
}

function formatDate(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Injuries() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const userId      = session.user.id

  const [loading,         setLoading]         = useState(true)
  const [injuries,        setInjuries]        = useState([])
  const [showAllResolved, setShowAllResolved] = useState(false)
  const [resolving,       setResolving]       = useState(null) // id being resolved

  // Form state
  const [bodyArea,   setBodyArea]   = useState('')
  const [description, setDescription] = useState('')
  const [severity,   setSeverity]   = useState('moderate')
  const [saving,     setSaving]     = useState(false)
  const [formError,  setFormError]  = useState('')

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('rex_coaching_notes')
        .select('id, body_area, note, severity, active, created_at, updated_at')
        .eq('user_id', userId)
        .eq('category', 'injury')
        .order('created_at', { ascending: false })
      setInjuries(data ?? [])
      setLoading(false)
    }
    load()
  }, [userId])

  const activeInjuries   = injuries.filter(i => i.active)
  const resolvedInjuries = injuries.filter(i => !i.active)
  const visibleResolved  = showAllResolved ? resolvedInjuries : resolvedInjuries.slice(0, 3)

  const handleResolve = async (id) => {
    setResolving(id)
    const now = new Date().toISOString()
    await supabase
      .from('rex_coaching_notes')
      .update({ active: false, updated_at: now })
      .eq('id', id)
    setInjuries(prev =>
      prev.map(i => i.id === id ? { ...i, active: false, updated_at: now } : i)
    )
    setResolving(null)
  }

  const handleReactivate = async (id) => {
    await supabase
      .from('rex_coaching_notes')
      .update({ active: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    setInjuries(prev => prev.map(i => i.id === id ? { ...i, active: true } : i))
  }

  const handleAdd = async () => {
    if (!bodyArea.trim() || !description.trim()) {
      setFormError('Body area and description are both required.')
      return
    }
    setSaving(true)
    setFormError('')
    const { data, error } = await supabase
      .from('rex_coaching_notes')
      .insert({
        user_id:   userId,
        category:  'injury',
        body_area: bodyArea.trim(),
        note:      description.trim(),
        severity,
        active:    true,
      })
      .select()
      .single()
    if (!error && data) {
      setInjuries(prev => [data, ...prev])
      setBodyArea('')
      setDescription('')
      setSeverity('moderate')
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <main className="max-w-lg mx-auto px-4 py-10 flex justify-center">
        <div className="w-8 h-8 border-4 border-[#1A3A5C] border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="max-w-lg mx-auto px-4 py-6 pb-16">

      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/profile')}
          className="text-sm text-slate-400 hover:text-slate-600 mb-3 flex items-center gap-1 transition-colors"
        >
          ← Profile
        </button>
        <h1 className="text-2xl font-bold text-gray-800">Injuries & Niggles</h1>
        <p className="text-sm text-gray-400 mt-1 leading-relaxed max-w-sm">
          Rex uses this to adapt your programme. Mark anything as resolved when you're back to full fitness.
        </p>
      </div>

      {/* ── Active section ─────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Active</h2>

        {activeInjuries.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 mb-4">
            <p className="text-sm text-gray-400 italic">
              No active injuries or niggles. Rex will programme without restrictions.
            </p>
          </div>
        ) : (
          <div className="space-y-3 mb-4">
            {activeInjuries.map(injury => {
              const sev = SEVERITY_CONFIG[injury.severity] ?? SEVERITY_CONFIG.mild
              return (
                <div
                  key={injury.id}
                  className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-1.5">
                    <p className="text-sm font-semibold text-slate-800">{injury.body_area}</p>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{ color: sev.color, backgroundColor: sev.bg }}
                    >
                      {sev.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mb-3 leading-relaxed">{injury.note}</p>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-gray-400">Added {formatDate(injury.created_at)}</p>
                    <button
                      onClick={() => handleResolve(injury.id)}
                      disabled={resolving === injury.id}
                      className="text-xs font-semibold text-teal-600 hover:text-teal-800 disabled:opacity-40 transition-colors"
                    >
                      {resolving === injury.id ? 'Saving…' : 'Mark as resolved'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Add form */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Add injury or niggle
          </p>
          <input
            type="text"
            value={bodyArea}
            onChange={e => { setBodyArea(e.target.value); setFormError('') }}
            placeholder="e.g. Left shoulder, Lower back, Right knee"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/30 placeholder-gray-300"
          />
          <input
            type="text"
            value={description}
            onChange={e => { setDescription(e.target.value); setFormError('') }}
            placeholder="e.g. Avoid overhead pressing, pain on impact"
            className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/30 placeholder-gray-300"
          />
          {/* Severity toggle */}
          <div className="flex gap-2">
            {['mild', 'moderate', 'severe'].map(s => {
              const isSelected = severity === s
              const cfg = SEVERITY_CONFIG[s]
              return (
                <button
                  key={s}
                  onClick={() => setSeverity(s)}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors"
                  style={isSelected
                    ? { color: cfg.color, backgroundColor: cfg.bg, borderColor: cfg.color + '80' }
                    : { color: '#9CA3AF', backgroundColor: 'white', borderColor: '#E5E7EB' }
                  }
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
          {formError && (
            <p className="text-xs text-red-500">{formError}</p>
          )}
          <button
            onClick={handleAdd}
            disabled={saving}
            className="w-full py-2.5 rounded-xl bg-[#1A3A5C] text-white text-sm font-semibold hover:bg-[#152f4c] disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* ── Resolved section ───────────────────────────────────────────────────── */}
      {resolvedInjuries.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Resolved</h2>
          <div className="space-y-2">
            {visibleResolved.map(injury => (
              <div
                key={injury.id}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 opacity-60"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-600">{injury.body_area}</p>
                    <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{injury.note}</p>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Resolved {formatDate(injury.updated_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleReactivate(injury.id)}
                    className="text-xs text-gray-400 hover:text-[#1A3A5C] transition-colors flex-shrink-0 mt-0.5"
                  >
                    Reactivate
                  </button>
                </div>
              </div>
            ))}
          </div>
          {resolvedInjuries.length > 3 && (
            <button
              onClick={() => setShowAllResolved(v => !v)}
              className="mt-3 text-sm text-[#1A3A5C] font-medium hover:underline"
            >
              {showAllResolved
                ? 'Show less'
                : `Show all ${resolvedInjuries.length} resolved`}
            </button>
          )}
        </div>
      )}

    </main>
  )
}
