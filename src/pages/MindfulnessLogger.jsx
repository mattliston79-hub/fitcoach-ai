import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { MINDFULNESS_PRACTICES } from '../coach/mindfulnessKnowledge'
import { calculateOakTreeState } from '../utils/oakTreeState'
import { checkAndAwardBadges } from '../utils/badges'

export default function MindfulnessLogger() {
  const { sessionId } = useParams()
  const { session: authSession } = useAuth()
  const navigate = useNavigate()
  const userId = authSession.user.id

  // ── State ─────────────────────────────────────────────────────────────────
  const [planSession, setPlanSession] = useState(null)
  const [practice, setPractice]       = useState(null)
  const [loading, setLoading]         = useState(true)

  const [phase, setPhase]     = useState('ready')   // ready | running | finished | saving
  const [elapsed, setElapsed] = useState(0)          // seconds
  const [notes, setNotes]     = useState('')
  const [error, setError]     = useState('')
  const [audioMode, setAudioMode] = useState(true)

  const timerRef    = useRef(null)
  const startedAtRef = useRef(null)

  // ── Load planned session ──────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from('sessions_planned')
        .select('id, session_type, practice_type, title, duration_mins, purpose_note, date')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single()

      if (err || !data) { setError('Session not found.'); setLoading(false); return }

      setPlanSession(data)
      const p = MINDFULNESS_PRACTICES[data.practice_type]
      setPractice(p ?? null)
      setLoading(false)
    }
    load()
  }, [sessionId, userId])

  // ── Timer ─────────────────────────────────────────────────────────────────
  function handleBegin() {
    startedAtRef.current = Date.now()
    setPhase('running')
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000))
    }, 1000)
  }

  function handleFinish() {
    clearInterval(timerRef.current)
    setPhase('finished')
  }

  useEffect(() => () => clearInterval(timerRef.current), [])

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleDone() {
    setPhase('saving')
    const today = new Date().toISOString().slice(0, 10)
    const durationMins = Math.max(1, Math.round(elapsed / 60))

    try {
      const { data: logged, error: logErr } = await supabase
        .from('sessions_logged')
        .insert({
          user_id:            userId,
          planned_session_id: sessionId,
          date:               today,
          session_type:       'mindfulness',
          practice_type:      planSession.practice_type,
          duration_mins:      durationMins,
          notes:              notes.trim() || null,
        })
        .select('id')
        .single()

      if (logErr) throw logErr

      await supabase
        .from('sessions_planned')
        .update({ status: 'complete' })
        .eq('id', sessionId)

      calculateOakTreeState(userId) // fire-and-forget
      checkAndAwardBadges(userId, {
        sessionType: 'mindfulness',
        isBodyScan:  planSession.practice_type === 'body_scan',
      }) // fire-and-forget

      navigate(`/post-session/${logged.id}`, {
        replace: true,
        state: {
          title:         practice?.name ?? planSession.title ?? 'Mindfulness',
          sessionType:   'mindfulness',
          durationMins,
          exerciseCount: 0,
          setsCount:     0,
        },
      })
    } catch (err) {
      setError('Could not save your session — please try again.')
      setPhase('finished')
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

  const practiceName = practice?.name ?? planSession.title ?? 'Mindfulness'
  const durationMins = practice?.duration_mins ?? planSession.duration_mins

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

      {/* ── Practice title ────────────────────────────────────────── */}
      <div className="px-6 pb-4 flex-shrink-0">
        <h1 className="text-white text-xl font-bold leading-tight">
          {practiceName}
          {durationMins && (
            <span className="text-teal-300 font-normal text-base ml-2">· {durationMins} min</span>
          )}
        </h1>
        {practice?.brief_description && (
          <p className="text-teal-200 text-sm mt-1 leading-relaxed italic">
            {practice.brief_description}
          </p>
        )}
      </div>

      {/* ── Scrollable content area ───────────────────────────────── */}
      <div className="flex-1 bg-white overflow-y-auto">
        <div className="max-w-xl mx-auto px-5 py-6">

          {/* Audio / text toggle — only when audio_url exists */}
          {practice?.audio_url && (
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setAudioMode(true)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  audioMode ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Audio
              </button>
              <button
                onClick={() => setAudioMode(false)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  !audioMode ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Text
              </button>
            </div>
          )}

          {/* Audio player — shown when audio_url exists and audioMode is true */}
          {practice?.audio_url && audioMode && (
            <div className="mb-8">
              <audio controls src={practice.audio_url} className="w-full mt-3" />
              <p className="text-xs text-gray-400 mt-2 text-center">
                Press play, then use the Mark Complete button when you're done.
              </p>
            </div>
          )}

          {/* Script paragraphs — shown when no audio_url, or user switched to text mode */}
          {practice?.script && (!practice?.audio_url || !audioMode) && (
            <div className="text-gray-700 text-sm space-y-4 mb-8">
              {practice.script.split('\n\n').map((para, i) => (
                <p key={i} style={{ lineHeight: '1.75' }}>{para}</p>
              ))}
            </div>
          )}

          {/* Timer + controls */}
          <div className="flex flex-col items-center gap-4 py-6 border-t border-gray-100">
            <div className="text-4xl font-mono text-teal-700 font-semibold tracking-widest">
              {mins}:{secs}
            </div>

            {phase === 'ready' && (
              <button
                onClick={handleBegin}
                className="bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold text-sm px-8 py-3 rounded-2xl transition-colors shadow-md"
              >
                ▶ Begin
              </button>
            )}

            {phase === 'running' && (
              <button
                onClick={handleFinish}
                className="bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-semibold text-sm px-8 py-3 rounded-2xl transition-colors shadow-md"
              >
                ✓ Finish
              </button>
            )}
          </div>

          {/* Notes + Done — shown after Finish */}
          {(phase === 'finished' || phase === 'saving') && (
            <div className="border-t border-gray-100 pt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  How did that feel? <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Anything you noticed…"
                  rows={3}
                  disabled={phase === 'saving'}
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none disabled:opacity-50"
                />
              </div>

              {error && (
                <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleDone}
                disabled={phase === 'saving'}
                className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white font-semibold text-sm py-3 rounded-2xl transition-colors"
              >
                {phase === 'saving' ? 'Saving…' : 'Done →'}
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
