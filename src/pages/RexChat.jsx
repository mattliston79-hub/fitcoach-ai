import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { askRex, makeClaudeCall } from '../coach/claudeApi'
import { generateRexPlan } from '../coach/rexOrchestrator'
import { supabase } from '../lib/supabase'
import { saveConversationSummary } from '../coach/conversationMemory'

// ── Quick-prompt chips shown in the empty state ────────────────────────────
const QUICK_PROMPTS = [
  {
    label: '🏠 Start training at home',
    text: "I want to start getting fitter at home — I don't have any gym equipment. Can you build me a simple beginner programme?",
  },
  {
    label: '🏃 Help me get to 5K',
    text: "I want to go from barely running to completing a 5K. Can you build me a couch-to-5K style plan?",
  },
  {
    label: '🏋️ First time at the gym',
    text: "I want to start going to the gym but I don't really know where to begin. Can you help?",
  },
  {
    label: '📊 Am I overtraining?',
    text: 'Based on my recent sessions and recovery scores, am I at risk of overtraining?',
  },
]

// ── Typing indicator ───────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4 px-4">
      <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
        R
      </div>
      <div className="bg-slate-100 border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

// ── Chat message bubble ────────────────────────────────────────────────────
function ChatMessage({ role, content }) {
  const isRex = role === 'assistant'
  return (
    <div className={`flex ${isRex ? 'justify-start' : 'justify-end'} mb-4 px-4`}>
      {isRex && (
        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
          R
        </div>
      )}
      <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
        isRex
          ? 'bg-slate-100 border border-slate-200 text-slate-900 rounded-tl-sm'
          : 'bg-[#F1F5F9] text-slate-800 rounded-tr-sm'
      }`}>
        {content}
      </div>
    </div>
  )
}

// ── Empty state with context card + quick prompts ──────────────────────────
function EmptyState({ context, onPrompt }) {
  const { profile, goalCount, lastSession } = context

  return (
    <div className="flex flex-col items-center py-8 px-6">
      <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-md">
        R
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Hi, I'm Rex</h2>
      <p className="text-sm text-gray-500 max-w-xs text-center mb-2 leading-relaxed">
        Your AI personal trainer. Tell me your goals, available time, and equipment —
        and I'll build you a programme and guide you through it.
      </p>
      <p className="text-xs text-gray-400 max-w-xs text-center mb-6 leading-relaxed">
        I focus on exercise and training. For how you're feeling emotionally or mentally, talk to Fitz.
      </p>

      {/* ── What Rex can see ──────────────────────────────────── */}
      {profile && (
        <div className="w-full max-w-sm bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            What I can see
          </p>
          <div className="space-y-2">
            {profile.experience_level && (
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm">🎯</span>
                <span className="text-xs text-slate-600">
                  <span className="font-medium capitalize">{profile.experience_level}</span> level
                </span>
              </div>
            )}
            {profile.preferred_session_types?.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm">🏋️</span>
                <span className="text-xs text-slate-600">
                  Trains: <span className="font-medium">{profile.preferred_session_types.map(t => t.replace(/_/g, ' ')).join(', ')}</span>
                </span>
              </div>
            )}
            {profile.available_days?.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm">📅</span>
                <span className="text-xs text-slate-600">
                  <span className="font-medium">{profile.available_days.length} days/week</span>
                  {profile.preferred_session_duration_mins && (
                    <> · <span className="font-medium">{profile.preferred_session_duration_mins} min</span> sessions</>
                  )}
                </span>
              </div>
            )}
            {goalCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm">📋</span>
                <span className="text-xs text-slate-600">
                  <span className="font-medium">{goalCount} active goal{goalCount !== 1 ? 's' : ''}</span>
                </span>
              </div>
            )}
            {lastSession && (
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm">⚡</span>
                <span className="text-xs text-slate-600">
                  Last session: <span className="font-medium capitalize">{lastSession.replace(/_/g, ' ')}</span>
                </span>
              </div>
            )}
            {!profile.experience_level && !goalCount && (
              <p className="text-xs text-slate-400 italic">Complete onboarding to unlock full personalisation.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Quick prompt chips ────────────────────────────────── */}
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium text-gray-400 text-center mb-3">Try asking me…</p>
        <div className="space-y-2">
          {QUICK_PROMPTS.map(p => (
            <button
              key={p.label}
              onClick={() => onPrompt(p.text)}
              className="w-full text-left text-sm bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-700 px-4 py-2.5 rounded-xl transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function RexChat() {
  const { session } = useAuth()
  const userId = session.user.id

  const [messages, setMessages]   = useState([])
  const apiMessages               = useRef([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState('')
  const [context, setContext]     = useState({ profile: null, goalCount: 0, lastSession: null })
  const [crisisLine, setCrisisLine] = useState({ name: 'Samaritans', number: '116 123' })

  const [rebuilding, setRebuilding]       = useState(false)
  const [rebuildMsg, setRebuildMsg]       = useState('')
  const [rebuildSuccess, setRebuildSuccess] = useState(false)

  const bottomRef         = useRef(null)
  const textareaRef       = useRef(null)
  const lastSavedCountRef = useRef(0)

  // ── Conversation memory save ──────────────────────────────────────────────
  const triggerSave = useCallback(() => {
    const msgs = apiMessages.current
    if (msgs.length < 4) return
    if (msgs.length <= lastSavedCountRef.current) return
    lastSavedCountRef.current = msgs.length
    saveConversationSummary(userId, 'rex', msgs)
  }, [userId])

  // Idle save: 60 seconds after the last message update with no typing
  useEffect(() => {
    if (messages.length < 4) return
    const timer = setTimeout(triggerSave, 60_000)
    return () => clearTimeout(timer)
  }, [messages, triggerSave])

  // Save on unmount (in-SPA navigation) and on beforeunload (tab close)
  useEffect(() => {
    const handleBeforeUnload = () => triggerSave()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      triggerSave()
    }
  }, [triggerSave])

  // Load context data to display in the empty state
  useEffect(() => {
    let cancelled = false
    async function loadContext() {
      const [profileRes, goalsRes, sessionRes] = await Promise.all([
        supabase
          .from('user_profiles')
          .select('experience_level, preferred_session_types, available_days, preferred_session_duration_mins')
          .eq('user_id', userId)
          .maybeSingle(),

        supabase
          .from('goals')
          .select('id')
          .eq('user_id', userId)
          .eq('status', 'active'),

        supabase
          .from('sessions_logged')
          .select('session_type')
          .eq('user_id', userId)
          .order('date', { ascending: false })
          .limit(1),
      ])
      if (cancelled) return
      setContext({
        profile:     profileRes.data ?? null,
        goalCount:   goalsRes.data?.length ?? 0,
        lastSession: sessionRes.data?.[0]?.session_type ?? null,
      })
    }
    loadContext()
    return () => { cancelled = true }
  }, [userId])

  // Load dynamic crisis line based on user's country
  useEffect(() => {
    async function loadCrisisLine() {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('country_code')
        .eq('user_id', userId)
        .single()

      if (profile?.country_code) {
        const { data: crisis } = await supabase
          .from('crisis_resources')
          .select('organisation, phone')
          .eq('country_code', profile.country_code)
          .maybeSingle()

        if (crisis?.organisation && crisis?.phone) {
          setCrisisLine({ name: crisis.organisation, number: crisis.phone })
          return
        }
      }

      const { data: fallback } = await supabase
        .from('crisis_resources')
        .select('organisation, phone')
        .eq('is_fallback', true)
        .maybeSingle()

      if (fallback?.organisation && fallback?.phone) {
        setCrisisLine({ name: fallback.organisation, number: fallback.phone })
      }
    }
    loadCrisisLine()
  }, [userId])

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const handleInput = (e) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const sendMessage = async (text = input.trim()) => {
    if (!text || sending) return

    const userMsg = { role: 'user', content: text }
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)
    setError('')

    setMessages(prev => [...prev, userMsg])
    const newApiMessages = [...apiMessages.current, userMsg]

    let planTriggered = false
    try {
      const { reply, planBuildTriggered } = await askRex(userId, newApiMessages, 'open_chat')
      planTriggered = !!planBuildTriggered
      const assistantMsg = { role: 'assistant', content: reply }
      apiMessages.current = [...newApiMessages, assistantMsg]
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setError(err.message)
      setMessages(prev => prev.slice(0, -1))
      setInput(text)
    } finally {
      setSending(false)
    }

    // If Rex triggered a programme build, run the 3-phase pipeline client-side
    if (planTriggered) {
      setRebuilding(true)
      setRebuildSuccess(false)
      setRebuildMsg('Building your programme…')
      try {
        const callClaude = (system, message, maxTokens) => makeClaudeCall(system, message, maxTokens)
        const { sessions } = await generateRexPlan(userId, supabase, callClaude)
        if (sessions?.length) {
          setRebuildSuccess(true)
          setRebuildMsg(`Programme saved — ${sessions.length} sessions ready.`)
        } else {
          setError("Rex couldn't build the programme — try the Rebuild button or ask Rex again.")
        }
      } catch (err) {
        console.error('[RexChat] plan build after chat failed:', err)
        setError(`Plan build failed: ${err.message}`)
      } finally {
        setRebuilding(false)
      }
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Rebuild plan ──────────────────────────────────────────────────────────
  const rebuildPlan = async () => {
    if (rebuilding || sending) return
    setRebuilding(true)
    setRebuildSuccess(false)
    setError('')

    try {
      setRebuildMsg('Reasoning about your week…')
      const callClaude = (system, message, maxTokens) => makeClaudeCall(system, message, maxTokens)
      // generateRexPlan now saves directly to programmes + programme_sessions
      const { sessions } = await generateRexPlan(userId, supabase, callClaude)

      if (!sessions.length) {
        setError("Rex couldn't build a plan right now — try again or chat to Rex about what you need.")
        return
      }

      setRebuildSuccess(true)
      setRebuildMsg(`Plan rebuilt — ${sessions.length} sessions scheduled.`)
    } catch (err) {
      console.error('[RexChat] rebuildPlan failed:', err)
      setError(`Plan rebuild failed: ${err.message}`)
    } finally {
      setRebuilding(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-slate-900 px-5 py-3 flex items-center gap-3 flex-shrink-0 shadow-md">
        <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold shadow-inner">
          R
        </div>
        <div className="flex-1">
          <h1 className="text-white font-semibold text-sm leading-tight">Rex</h1>
          <p className="text-slate-400 text-xs">Your AI Personal Trainer</p>
        </div>
        <button
          onClick={rebuildPlan}
          disabled={rebuilding || sending}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
        >
          {rebuilding ? (
            <>
              <span className="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
              {rebuildMsg || 'Rebuilding…'}
            </>
          ) : (
            <>↺ Rebuild plan</>
          )}
        </button>
      </div>

      {/* ── Rebuild success banner ───────────────────────────────── */}
      {rebuildSuccess && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-emerald-800">
            <strong>Done!</strong> {rebuildMsg}
          </p>
          <button
            onClick={() => setRebuildSuccess(false)}
            className="text-emerald-600 text-xs ml-3 hover:text-emerald-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Crisis disclaimer ───────────────────────────────────── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0">
        <p className="text-xs text-amber-800 text-center">
          <strong>In crisis?</strong> Call {crisisLine.name}: <strong>{crisisLine.number}</strong> — free and available 24/7
        </p>
      </div>

      {/* ── Chat messages ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-2xl mx-auto py-4">
          {messages.length === 0 && !sending && (
            <EmptyState context={context} onPrompt={sendMessage} />
          )}
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}
          {sending && <TypingIndicator />}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input bar ───────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-200 shadow-lg flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-3">
          {error && (
            <p className="text-red-600 text-xs mb-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          <div className="flex gap-2 items-end">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Message Rex…"
              rows={1}
              disabled={sending}
              className="flex-1 resize-none overflow-hidden rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:border-transparent disabled:opacity-50 leading-relaxed"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
              className="bg-slate-800 hover:bg-slate-900 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors flex-shrink-0"
            >
              Send
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Enter to send · Shift+Enter for a new line
          </p>
        </div>
      </div>
    </div>
  )
}
