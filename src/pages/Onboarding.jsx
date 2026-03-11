import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { askFitz, extractGoal } from '../coach/claudeApi'
import { supabase } from '../lib/supabase'

// Synthetic trigger message — kicks off the conversation without a real user message.
// Never shown in the UI.
const TRIGGER = { role: 'user', content: '__ONBOARDING_START__' }

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
          : 'bg-teal-600 text-white rounded-tr-sm'
      }`}>
        {content}
      </div>
    </div>
  )
}

export default function Onboarding() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const userId = session.user.id

  // uiMessages: what the user sees (excludes the synthetic TRIGGER)
  const [uiMessages, setUiMessages] = useState([])
  // apiMessages: what gets sent to the API (always starts with TRIGGER)
  const apiMessages = useRef([TRIGGER])

  const [input, setInput] = useState('')
  const [loadingOpening, setLoadingOpening] = useState(true)
  const [sending, setSending] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState('')

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const textareaRef = useRef(null)

  // Show "complete" button after the user has sent at least 4 messages
  const userTurnCount = uiMessages.filter(m => m.role === 'user').length
  const showCompleteButton = userTurnCount >= 4 && !completing

  // Auto-scroll to the latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [uiMessages, sending, loadingOpening])

  // Get Fitz's opening message on mount
  useEffect(() => {
    let cancelled = false

    async function getOpening() {
      try {
        const reply = await askFitz(userId, [TRIGGER], 'onboarding')
        if (cancelled) return
        const assistantMsg = { role: 'assistant', content: reply }
        apiMessages.current = [TRIGGER, assistantMsg]
        setUiMessages([assistantMsg])
      } catch (err) {
        if (!cancelled) setError(err.message)
      } finally {
        if (!cancelled) setLoadingOpening(false)
      }
    }

    getOpening()
    return () => { cancelled = true }
  }, [userId])

  // Auto-resize textarea as user types
  const handleInput = (e) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending || loadingOpening || completing) return

    const userMsg = { role: 'user', content: text }
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setSending(true)
    setError('')

    // Optimistic UI: show user message immediately
    setUiMessages(prev => [...prev, userMsg])

    const newApiMessages = [...apiMessages.current, userMsg]

    try {
      const reply = await askFitz(userId, newApiMessages, 'onboarding')
      const assistantMsg = { role: 'assistant', content: reply }
      apiMessages.current = [...newApiMessages, assistantMsg]
      setUiMessages(prev => [...prev, assistantMsg])
    } catch (err) {
      setError(err.message)
      // Rollback the optimistic user message
      setUiMessages(prev => prev.slice(0, -1))
      setInput(text)
    } finally {
      setSending(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const completeOnboarding = async () => {
    setCompleting(true)
    setError('')

    try {
      // 1. Extract the committed goal from the conversation
      const goalText = await extractGoal(apiMessages.current)

      // 2. Save goal to goals table
      const { error: goalErr } = await supabase.from('goals').insert({
        user_id: userId,
        goal_statement: goalText,
        status: 'active',
      })
      if (goalErr) throw goalErr

      // 3. Save the full conversation to coach_conversations
      const { error: convErr } = await supabase.from('coach_conversations').insert({
        user_id: userId,
        persona: 'fitz',
        mode: 'onboarding',
        messages_json: apiMessages.current,
      })
      if (convErr) throw convErr

      // 4. Mark onboarding complete on the users row
      const { error: userErr } = await supabase
        .from('users')
        .update({ onboarding_complete: true })
        .eq('id', userId)
      if (userErr) throw userErr

      // 5. Head to the dashboard
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
      setCompleting(false)
    }
  }

  return (
    <div className="min-h-screen bg-teal-700 flex flex-col">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-teal-700 px-5 py-4 flex items-center gap-3 shadow-sm flex-shrink-0">
        <div className="w-10 h-10 rounded-full bg-teal-500 flex items-center justify-center text-white font-bold text-lg shadow-inner">
          F
        </div>
        <div>
          <h1 className="text-white font-semibold text-base leading-tight">Fitz</h1>
          <p className="text-teal-200 text-xs">Your AI Fitness Coach</p>
        </div>
      </div>

      {/* ── Chat area ──────────────────────────────────────────── */}
      <div className="flex-1 bg-white overflow-y-auto">
        <div className="max-w-2xl mx-auto py-6">
          {loadingOpening ? (
            <TypingIndicator />
          ) : (
            <>
              {uiMessages.map((msg, i) => (
                <ChatMessage key={i} role={msg.role} content={msg.content} />
              ))}
              {sending && <TypingIndicator />}
            </>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input area ─────────────────────────────────────────── */}
      <div className="bg-white border-t border-gray-200 shadow-lg flex-shrink-0">
        <div className="max-w-2xl mx-auto px-4 py-3">

          {error && (
            <p className="text-red-600 text-xs mb-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Complete onboarding button — appears after 4 user messages */}
          {showCompleteButton && (
            <button
              onClick={completeOnboarding}
              disabled={completing || sending}
              className="w-full mb-3 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white text-sm font-semibold py-3 rounded-xl transition-colors"
            >
              {completing ? 'Saving your goal…' : "I've set my goal — take me to my plan →"}
            </button>
          )}

          <div className="flex gap-2 items-end">
            <textarea
              ref={(el) => { inputRef.current = el; textareaRef.current = el }}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder="Type your message…"
              rows={1}
              disabled={loadingOpening || sending || completing}
              className="flex-1 resize-none overflow-hidden rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent disabled:opacity-50 leading-relaxed"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending || loadingOpening || completing}
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
