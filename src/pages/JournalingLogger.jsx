import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { MINDFULNESS_PRACTICES } from '../coach/mindfulnessKnowledge'
import { calculateOakTreeState } from '../utils/oakTreeState'
import { checkAndAwardBadges } from '../utils/badges'

const TABS = [
  { key: 'reflection', label: 'Reflect' },
  { key: 'gratitude',  label: 'Gratitude' },
  { key: 'planning',   label: 'Plan' },
]

function randomPrompt(prompts, exclude) {
  const pool = exclude ? prompts.filter(p => p !== exclude) : prompts
  return pool[Math.floor(Math.random() * pool.length)]
}

export default function JournalingLogger() {
  const { sessionId } = useParams()
  const { session: authSession } = useAuth()
  const navigate = useNavigate()
  const userId = authSession.user.id

  const practice = MINDFULNESS_PRACTICES.journaling

  // ── State ─────────────────────────────────────────────────────────────────
  const [planSession, setPlanSession] = useState(null)
  const [loading, setLoading]         = useState(true)
  const [error, setError]             = useState('')
  const [saving, setSaving]           = useState(false)

  const [activeTab, setActiveTab]     = useState('reflection')
  const [prompt, setPrompt]           = useState(() => randomPrompt(practice.prompts.reflection))
  const [entry, setEntry]             = useState('')

  const [elapsed, setElapsed]         = useState(0)
  const timerRef                      = useRef(null)
  const startedAtRef                  = useRef(Date.now())

  // ── Load planned session ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from('sessions_planned')
        .select('id, session_type, practice_type, title, duration_mins, date')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (err || !data) {
        setError('Session not found.')
        setLoading(false)
        return
      }

      if (data.practice_type !== 'journaling') {
        navigate('/dashboard', { replace: true })
        return
      }

      setPlanSession(data)
      setLoading(false)
    }
    load()
  }, [sessionId, userId, navigate])

  // ── Auto-start elapsed timer ──────────────────────────────────────────────
  useEffect(() => {
    startedAtRef.current = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  // ── Tab switch ────────────────────────────────────────────────────────────
  function handleTabChange(key) {
    setActiveTab(key)
    setPrompt(randomPrompt(practice.prompts[key]))
  }

  function handleNewPrompt() {
    setPrompt(randomPrompt(practice.prompts[activeTab], prompt))
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleDone() {
    setSaving(true)
    const today = new Date().toISOString().slice(0, 10)
    const durationMins = Math.ceil(elapsed / 60) || 10

    try {
      const { data: logged, error: logErr } = await supabase
        .from('sessions_logged')
        .insert({
          user_id:            userId,
          planned_session_id: sessionId,
          date:               today,
          session_type:       'mindfulness',
          practice_type:      'journaling',
          duration_mins:      durationMins,
          notes:              null,
        })
        .select('id')
        .single()

      if (logErr) throw logErr

      await supabase
        .from('sessions_planned')
        .update({ status: 'complete' })
        .eq('id', sessionId)

      calculateOakTreeState(userId)
      checkAndAwardBadges(userId, { sessionType: 'mindfulness', isBodyScan: false })

      navigate(`/post-session/${logged.id}`, {
        replace: true,
        state: {
          title:         'Journaling',
          sessionType:   'mindfulness',
          durationMins,
          exerciseCount: 0,
          setsCount:     0,
        },
      })
    } catch (err) {
      setError('Could not save your session — please try again.')
      setSaving(false)
    }
  }

  // ── Timer display ─────────────────────────────────────────────────────────
  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const secs = String(elapsed % 60).padStart(2, '0')

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-teal-700 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error && !planSession) {
    return (
      <div className="min-h-screen bg-teal-700 flex items-center justify-center px-6">
        <p className="text-white text-sm text-center">{error}</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-teal-700 flex flex-col">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="text-teal-200 hover:text-white transition-colors text-sm"
        >
          ← Back
        </button>
      </div>

      {/* ── Title ─────────────────────────────────────────────────── */}
      <div className="px-6 pb-4 flex-shrink-0">
        <h1 className="text-white text-xl font-bold leading-tight">
          Journaling
          <span className="text-teal-300 font-normal text-base ml-2">· 10 min</span>
        </h1>
        <p className="text-teal-200 text-sm mt-1 leading-relaxed italic">
          {practice.brief_description}
        </p>
      </div>

      {/* ── Scrollable content ────────────────────────────────────── */}
      <div className="flex-1 bg-white overflow-y-auto">
        <div className="max-w-xl mx-auto px-5 py-6 space-y-5">

          {/* Tab picker */}
          <div className="flex gap-2">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Prompt card */}
          <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-4">
            <p className="text-teal-900 text-sm leading-relaxed font-medium">{prompt}</p>
            <button
              onClick={handleNewPrompt}
              className="mt-3 text-xs text-teal-600 hover:text-teal-800 font-medium transition-colors"
            >
              New prompt →
            </button>
          </div>

          {/* Writing area */}
          <textarea
            value={entry}
            onChange={e => setEntry(e.target.value)}
            placeholder="Write here — this is just for you."
            rows={8}
            className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none leading-relaxed"
          />

          {/* Elapsed timer */}
          <p className="text-xs text-gray-400 text-center tabular-nums">
            {mins}:{secs} elapsed
          </p>

          {/* Error */}
          {error && (
            <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Done button */}
          <button
            onClick={handleDone}
            disabled={saving}
            className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-2xl transition-colors"
          >
            {saving ? 'Saving…' : "I'm done →"}
          </button>

        </div>
      </div>
    </div>
  )
}
