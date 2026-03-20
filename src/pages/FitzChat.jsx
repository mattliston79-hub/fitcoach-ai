import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { askFitz } from '../coach/claudeApi'
import { supabase } from '../lib/supabase'
import { saveConversationSummary } from '../coach/conversationMemory'

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

function ChatMessage({ role, content }) {
  const isFitz = role === 'assistant'
  return (
    <div className={`flex ${isFitz ? 'justify-start' : 'justify-end'} mb-4 px-4`}>
      {isFitz && (
        <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 mt-1">
          F
        </div>
      )}
      <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap leading-relaxed ${
        isFitz
          ? 'bg-teal-50 border border-teal-100 text-teal-900 rounded-tl-sm'
          : 'bg-slate-100 text-slate-800 rounded-tr-sm'
      }`}>
        {content}
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-teal-600 flex items-center justify-center text-white text-2xl font-bold mb-4 shadow-md">
        F
      </div>
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Hi, I'm Fitz</h2>
      <p className="text-sm text-gray-500 max-w-xs">
        Your health and wellbeing coach. I'm an AI coach, not a therapist or personal trainer — for training and exercise advice, talk to Rex.
      </p>
    </div>
  )
}

export default function FitzChat() {
  const { session } = useAuth()
  const { state }   = useLocation()
  const userId = session.user.id

  const [messages, setMessages] = useState([])
  const apiMessages = useRef([])

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

  // Auto-send initialMessage from router state (post-session debrief)
  const autoSentRef = useRef(false)
  useEffect(() => {
    if (!state?.initialMessage || autoSentRef.current) return
    autoSentRef.current = true
    const t = setTimeout(() => sendMessage(state.initialMessage), 800)
    return () => clearTimeout(t)
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
      const reply = await askFitz(userId, newApiMessages, 'open_chat')
      const assistantMsg = { role: 'assistant', content: reply }
      apiMessages.current = [...newApiMessages, assistantMsg]
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
          {messages.length === 0 && !sending && <EmptyState />}
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
