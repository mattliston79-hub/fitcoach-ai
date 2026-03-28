import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { askFitz } from '../coach/claudeApi'
import { supabase } from '../lib/supabase'
import { saveConversationSummary } from '../coach/conversationMemory'
import { addMindfulnessSession } from '../coach/fitzActions'

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-4 px-4">
      <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
        F
      </div>
      <div className="bg-teal-50 border border-teal-100 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function ScriptCard({ scriptData, plannerAction, userId }) {
  const [plannerState, setPlannerState] = useState('idle') // idle | loading | done | error

  const handleAddToPlanner = async () => {
    if (!plannerAction || plannerState !== 'idle') return
    setPlannerState('loading')
    const result = await addMindfulnessSession({
      userId,
      date:        plannerAction.date,
      practiceKey: plannerAction.practice,
      durationMins: plannerAction.duration ?? scriptData.duration_mins,
      purposeNote: plannerAction.purpose ?? `${scriptData.name} mindfulness session.`,
    })
    setPlannerState(result.success ? 'done' : 'error')
  }

  return (
    <div className="border-l-4 border-teal-500 bg-teal-50 rounded-r-2xl px-4 py-4 mt-1">
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-teal-800 font-semibold text-sm">{scriptData.name}</span>
        <span className="bg-teal-200 text-teal-800 text-xs font-medium px-2 py-0.5 rounded-full">
          {scriptData.duration_mins} min
        </span>
      </div>
      {/* Brief description */}
      <p className="text-teal-700 text-xs italic mb-3 leading-relaxed">{scriptData.brief_description}</p>
      {/* Script paragraphs */}
      <div className="text-teal-900 text-sm space-y-3">
        {scriptData.script.split('\n\n').map((para, i) => (
          <p key={i} style={{ lineHeight: '1.7' }}>{para}</p>
        ))}
      </div>
      {/* Planner button / confirmation */}
      {plannerState === 'done' ? (
        <p className="mt-4 text-xs text-teal-600 font-medium">✓ Added to your planner</p>
      ) : plannerState === 'error' ? (
        <p className="mt-4 text-xs text-red-400">Could not add to planner — try again</p>
      ) : (
        <button
          onClick={handleAddToPlanner}
          disabled={!plannerAction || plannerState === 'loading'}
          className="mt-4 w-full border border-teal-400 text-teal-600 text-xs font-medium py-2 rounded-xl transition-colors hover:bg-teal-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {plannerState === 'loading' ? 'Adding…' : plannerAction ? 'Add to my planner' : 'Add to my planner'}
        </button>
      )}
    </div>
  )
}

// Fires addMindfulnessSession once on mount when Fitz outputs [ADD_MINDFULNESS]
// in a follow-up message (without a script delivery in the same turn).
function PlannerAutoAdd({ plannerAction, userId }) {
  const [state, setState] = useState('loading') // loading | done | error
  const firedRef = useRef(false)

  useEffect(() => {
    if (firedRef.current) return
    firedRef.current = true
    addMindfulnessSession({
      userId,
      date:         plannerAction.date,
      practiceKey:  plannerAction.practice,
      durationMins: plannerAction.duration,
      purposeNote:  plannerAction.purpose ?? `${plannerAction.practice?.replace(/_/g, ' ')} mindfulness session.`,
    }).then(result => setState(result.success ? 'done' : 'error'))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (state === 'loading') {
    return (
      <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 text-xs text-teal-600 flex items-center gap-1.5">
        <span className="w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin inline-block" />
        Adding to your planner…
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-600">
        Could not add to planner — you can add it manually from the planner screen.
      </div>
    )
  }
  return (
    <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 text-xs text-teal-700 flex items-center gap-1.5">
      <span>✓</span> Added to your planner: {plannerAction.practice?.replace(/_/g, ' ')} on {plannerAction.date}
    </div>
  )
}

function ChatMessage({ role, content, scriptData, plannerAction, userId }) {
  const isFitz = role === 'assistant'
  return (
    <div className={`flex ${isFitz ? 'justify-start' : 'justify-end'} mb-4 px-4`}>
      {isFitz && (
        <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
          F
        </div>
      )}
      <div className="max-w-[75%] flex flex-col gap-2">
        <div className={`rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
          isFitz
            ? 'bg-teal-50 border border-teal-100 text-teal-900 rounded-tl-sm'
            : 'bg-slate-100 text-slate-800 rounded-tr-sm'
        }`}>
          {content}
        </div>
        {scriptData && <ScriptCard scriptData={scriptData} plannerAction={plannerAction} userId={userId} />}
        {!scriptData && plannerAction && (
          <PlannerAutoAdd plannerAction={plannerAction} userId={userId} />
        )}
      </div>
    </div>
  )
}

function EmptyState({ onPrompt }) {
  const SUGGESTIONS = [
    {
      emoji: '🌱',
      text: "I've been feeling really stressed lately and it's affecting my sleep",
    },
    {
      emoji: '🎯',
      text: "Help me set a realistic goal — I want to get more active but don't know where to start",
    },
    {
      emoji: '🧘',
      text: "I'd like to try a body scan or breathing exercise to wind down tonight",
    },
  ]

  return (
    <div className="flex flex-col items-center py-10 px-6">
      <div className="w-16 h-16 rounded-full bg-teal-600 flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-md">
        F
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Hi, I'm Fitz</h2>
      <p className="text-sm text-gray-500 max-w-xs text-center mb-2 leading-relaxed">
        Your health and wellbeing coach. I'm here to help with how you're feeling —
        not just physically, but emotionally and socially too.
      </p>
      <p className="text-xs text-gray-400 max-w-xs text-center mb-6 leading-relaxed">
        I'm an AI coach, not a therapist. For exercise programmes and training advice, talk to Rex.
      </p>

      {/* What Fitz is good at */}
      <div className="w-full max-w-sm bg-teal-50 border border-teal-100 rounded-2xl p-4 mb-6">
        <p className="text-xs font-semibold text-teal-500 uppercase tracking-wide mb-3">
          What I can help with
        </p>
        <ul className="space-y-2 text-sm text-teal-800">
          <li className="flex gap-2"><span>💬</span><span>Talking through stress, low mood, or feeling overwhelmed</span></li>
          <li className="flex gap-2"><span>🎯</span><span>Setting meaningful goals and staying motivated</span></li>
          <li className="flex gap-2"><span>😴</span><span>Sleep, energy, and recovery check-ins</span></li>
          <li className="flex gap-2"><span>🧘</span><span>Guided body scans and mindfulness exercises</span></li>
          <li className="flex gap-2"><span>🤝</span><span>Staying connected — social wellbeing matters too</span></li>
        </ul>
      </div>

      {/* Suggestion chips */}
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium text-gray-400 text-center mb-3">
          Try saying…
        </p>
        <div className="space-y-2">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onPrompt(s.text)}
              className="w-full text-left text-sm bg-white border border-teal-100 hover:bg-teal-50 hover:border-teal-300 text-gray-700 px-4 py-3 rounded-xl transition-colors leading-relaxed"
            >
              <span className="mr-2">{s.emoji}</span>{s.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function FitzChat() {
  const { session } = useAuth()
  const { state }   = useLocation()
  const userId = session.user.id

  const [messages, setMessages] = useState([])
  const apiMessages = useRef([])

  const weeklyReviewMode = state?.mode === 'weekly_review'
  const weeklyPlannedId  = state?.plannedSessionId ?? null

  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [crisisLine, setCrisisLine] = useState({ name: 'Samaritans', number: '116 123' })

  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  // Tracks how many messages were present at the last save — avoids duplicate summaries
  const lastSavedCountRef = useRef(0)

  // ── Conversation memory save ──────────────────────────────────────────────
  // Stable callback: saves only if there are new messages since the last save
  // and the conversation has at least 4 messages (2 full exchanges).
  const triggerSave = useCallback(() => {
    const msgs = apiMessages.current
    if (msgs.length < 4) return
    if (msgs.length <= lastSavedCountRef.current) return
    lastSavedCountRef.current = msgs.length
    // Fire-and-forget — never await here (called from cleanup / event handlers)
    saveConversationSummary(userId, 'fitz', msgs)
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

  // Auto-send initialMessage from router state (post-session debrief) or start weekly review
  const autoSentRef = useRef(false)
  useEffect(() => {
    if (autoSentRef.current) return
    autoSentRef.current = true

    if (state?.initialMessage) {
      const t = setTimeout(() => sendMessage(state.initialMessage), 800)
      return () => clearTimeout(t)
    }

    if (weeklyReviewMode) {
      // Log the session immediately so it appears in activity data
      const today = new Date().toISOString().slice(0, 10)
      supabase.from('sessions_logged').insert({
        user_id: userId,
        planned_session_id: weeklyPlannedId,
        date: today,
        session_type: 'mindfulness',
        practice_type: 'weekly_review',
        duration_mins: 15,
        notes: null,
      }).then(({ error }) => {
        if (error) console.error('[FitzChat] weekly review log error:', error)
      })

      // Mark planned session complete if we have an id
      if (weeklyPlannedId) {
        supabase.from('sessions_planned')
          .update({ status: 'complete' })
          .eq('id', weeklyPlannedId)
          .then(({ error }) => {
            if (error) console.error('[FitzChat] weekly review planner update error:', error)
          })
      }

      // Send opening prompt to Fitz after a short delay
      const t = setTimeout(() => {
        sendMessage(
          "Hi Fitz — I'm here for my weekly check-in. Can we go through how the week has gone?"
        )
      }, 800)
      return () => clearTimeout(t)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Idle save: reset 60-second timer on every message update
  useEffect(() => {
    if (messages.length < 4) return
    const timer = setTimeout(triggerSave, 60_000)
    return () => clearTimeout(timer)
  }, [messages, triggerSave])

  // Save on unmount (handles in-SPA navigation away from the chat)
  // and register beforeunload for tab close / page refresh
  useEffect(() => {
    const handleBeforeUnload = () => triggerSave()
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      triggerSave() // unmount = navigating away within the app
    }
  }, [triggerSave])

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, sending])

  const handleInput = (e) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const sendMessage = async (overrideText) => {
    const text = (overrideText ?? input).trim()
    if (!text || sending) return

    const userMsg = { role: 'user', content: text }
    if (!overrideText) {
      setInput('')
      if (textareaRef.current) textareaRef.current.style.height = 'auto'
    }
    setSending(true)
    setError('')

    // Optimistic UI
    setMessages(prev => [...prev, userMsg])
    const newApiMessages = [...apiMessages.current, userMsg]

    try {
      const chatMode = weeklyReviewMode ? 'weekly_review' : 'open_chat'
      const { reply, scriptData, plannerAction } = await askFitz(userId, newApiMessages, chatMode)

      const assistantMsg = { role: 'assistant', content: reply, scriptData, plannerAction }
      // API history stores only clean text — no marker fields
      apiMessages.current = [...newApiMessages, { role: 'assistant', content: reply }]
      setMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setError(err.message)
      setMessages(prev => prev.slice(0, -1))
      if (!overrideText) setInput(text)
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* ── Crisis disclaimer ───────────────────────────────────── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0">
        <p className="text-xs text-amber-800 text-center">
          <strong>In crisis?</strong> Call {crisisLine.name}: <strong>{crisisLine.number}</strong> — free and available 24/7
        </p>
      </div>

      {/* ── Fitz header ─────────────────────────────────────────── */}
      <div className="bg-teal-700 px-5 py-3 flex items-center gap-3 flex-shrink-0 shadow-sm">
        <div className="w-9 h-9 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold shadow-inner">
          F
        </div>
        <div>
          <h1 className="text-white font-semibold text-sm leading-tight">Fitz</h1>
          <p className="text-teal-200 text-xs">Your Wellbeing Coach</p>
        </div>
      </div>

      {/* ── Chat messages ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-white">
        <div className="max-w-2xl mx-auto py-6">
          {messages.length === 0 && !sending && <EmptyState onPrompt={text => sendMessage(text)} />}
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} scriptData={msg.scriptData} plannerAction={msg.plannerAction} userId={userId} />
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
              placeholder="Message Fitz…"
              rows={1}
              disabled={sending}
              className="flex-1 resize-none overflow-hidden rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 leading-relaxed"
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || sending}
              className="bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors flex-shrink-0"
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
