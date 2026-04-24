import { useState, useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { askFitz } from '../coach/claudeApi'
import { supabase } from '../lib/supabase'
import { saveConversationSummary } from '../coach/conversationMemory'
import { addMindfulnessSession } from '../coach/fitzActions'
import { addLifestyleSession } from '../utils/addLifestyleSession'
import { Leaf, Target, Wind, MessageCircle, Moon, HeartHandshake } from 'lucide-react'

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-6 px-4 sm:px-6 animate-fade-in-up">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 shadow-md flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0 mt-0.5 border border-teal-500/50">
        F
      </div>
      <div className="bg-white/80 backdrop-blur-md border border-teal-100 shadow-sm rounded-2xl rounded-tl-sm px-5 py-4">
        <div className="flex gap-1.5 items-center h-4">
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
    <div className="border-l-[3px] border-teal-500 bg-teal-50/80 backdrop-blur-sm rounded-r-2xl px-5 py-5 mt-2 mb-1 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-teal-900 font-bold text-[15px] tracking-tight">{scriptData.name}</span>
        <span className="bg-white/80 text-teal-800 text-[11px] font-bold tracking-wider uppercase px-2.5 py-1 rounded-full shadow-sm">
          {scriptData.duration_mins} min
        </span>
      </div>
      {/* Brief description */}
      <p className="text-teal-700 text-[13px] italic mb-4 leading-relaxed font-medium">{scriptData.brief_description}</p>
      {/* Script paragraphs */}
      <div className="text-teal-900 text-[14px] space-y-4">
        {scriptData.script.split('\n\n').map((para, i) => (
          <p key={i} className="leading-[1.7]">{para}</p>
        ))}
      </div>
      {/* Planner button / confirmation */}
      {plannerState === 'done' ? (
        <p className="mt-5 text-[13px] text-teal-700 font-bold flex items-center gap-1.5"><span className="text-emerald-500">✓</span> Added to your planner</p>
      ) : plannerState === 'error' ? (
        <p className="mt-5 text-[13px] text-red-500 font-medium">Could not add to planner — try again</p>
      ) : (
        <button
          onClick={handleAddToPlanner}
          disabled={!plannerAction || plannerState === 'loading'}
          className="mt-5 w-full bg-white/80 border border-teal-200/60 shadow-sm text-teal-700 text-[14px] font-semibold py-2.5 rounded-xl transition-all hover:bg-white hover:shadow hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-sm disabled:hover:-translate-y-0"
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
      <div className="bg-teal-50/80 backdrop-blur-sm border border-teal-200/50 shadow-sm rounded-xl px-4 py-3 text-[13px] text-teal-700 flex items-center gap-2 font-medium mt-1 mb-2">
        <span className="w-3.5 h-3.5 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin inline-block" />
        Adding to your planner…
      </div>
    )
  }
  if (state === 'error') {
    return (
      <div className="bg-red-50/80 backdrop-blur-sm border border-red-200/50 shadow-sm rounded-xl px-4 py-3 text-[13px] text-red-600 font-medium mt-1 mb-2">
        Could not add to planner — you can add it manually from the planner screen.
      </div>
    )
  }
  return (
    <div className="bg-teal-50/80 backdrop-blur-sm border border-teal-200/50 shadow-sm rounded-xl px-4 py-3 text-[13px] text-teal-800 flex items-center gap-2 font-medium mt-1 mb-2">
      <span className="text-emerald-500 text-[15px]">✓</span> Added to your planner: {plannerAction.practice?.replace(/_/g, ' ')} on {plannerAction.date}
    </div>
  )
}

function AddSessionCard({ sessionAction, userId }) {
  const [state, setState] = useState('idle') // idle | loading | done | error

  const handleAdd = async () => {
    if (state !== 'idle') return
    setState('loading')
    try {
      await addLifestyleSession({
        userId,
        title: sessionAction.title,
        date: sessionAction.date,
        duration_mins: sessionAction.duration_mins,
        purpose_note: sessionAction.purpose_note,
        session_type: sessionAction.session_type,
        goal_id: sessionAction.goal_id,
        notes: sessionAction.notes,
        supabase
      })
      setState('done')
    } catch (err) {
      console.error('Add session error:', err)
      setState('error')
    }
  }

  const handleDismiss = () => setState('dismissed')

  if (state === 'dismissed') return null

  if (state === 'done') {
    return (
      <div className="border-l-4 border-teal-500 bg-teal-50 rounded-r-2xl px-4 py-3 mt-1 text-teal-700 text-sm font-medium">
        Done — added to your diary.
      </div>
    )
  }

  return (
    <div className="border-l-[3px] border-emerald-500 bg-emerald-50/80 backdrop-blur-sm rounded-r-2xl px-5 py-5 mt-2 mb-1 shadow-sm">
      <h3 className="text-emerald-900 font-bold text-[16px] tracking-tight mb-2">{sessionAction.title}</h3>
      <div className="flex gap-2 text-emerald-700 text-[12px] font-bold uppercase tracking-wider mb-3">
        <span>{new Date(sessionAction.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        <span>•</span>
        <span>{sessionAction.duration_mins} min</span>
      </div>
      <p className="text-emerald-800 text-[14px] italic mb-5 leading-relaxed font-medium">
        "{sessionAction.purpose_note}"
      </p>
      
      {state === 'error' && (
        <p className="text-red-500 text-[13px] mb-4 font-medium">Something went wrong — try again.</p>
      )}
      
      <div className="flex items-center gap-3">
        <button
          onClick={handleAdd}
          disabled={state === 'loading'}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 hover:shadow-md hover:-translate-y-0.5 transition-all text-white font-semibold text-[14px] px-5 py-2.5 rounded-xl shadow-sm"
        >
          {state === 'loading' ? 'Adding...' : 'Add to diary'}
        </button>
        <button
          onClick={handleDismiss}
          disabled={state === 'loading'}
          className="text-emerald-700 hover:text-emerald-900 disabled:opacity-50 hover:bg-emerald-100 font-semibold text-[14px] px-4 py-2.5 rounded-xl transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  )
}

function ChatMessage({ role, content, scriptData, plannerAction, addSessionAction, userId }) {
  const isFitz = role === 'assistant'
  return (
    <div className={`flex ${isFitz ? 'justify-start' : 'justify-end'} mb-6 px-4 sm:px-6 animate-fade-in-up`}>
      {isFitz && (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-600 to-teal-800 shadow-md flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0 mt-0.5 border border-teal-500/50">
          F
        </div>
      )}
      <div className={`max-w-[85%] sm:max-w-[75%] flex flex-col gap-2`}>
        <div className={`rounded-2xl px-5 py-3.5 text-[15px] whitespace-pre-wrap leading-[1.6] tracking-tight ${
          isFitz
            ? 'bg-white/80 backdrop-blur-md border border-teal-100 shadow-sm text-teal-900 rounded-tl-sm'
            : 'bg-gradient-to-br from-teal-700 to-teal-900 text-white shadow-premium-sm rounded-tr-sm border border-teal-800'
        }`}>
          {content}
        </div>
        {scriptData && <ScriptCard scriptData={scriptData} plannerAction={plannerAction} userId={userId} />}
        {!scriptData && plannerAction && (
          <PlannerAutoAdd plannerAction={plannerAction} userId={userId} />
        )}
        {addSessionAction && (
          <AddSessionCard sessionAction={addSessionAction} userId={userId} />
        )}
      </div>
    </div>
  )
}

function EmptyState({ onPrompt }) {
  const SUGGESTIONS = [
    {
      icon: <Leaf className="w-5 h-5 text-teal-600" />,
      text: "I've been feeling really stressed lately and it's affecting my sleep",
    },
    {
      icon: <Target className="w-5 h-5 text-teal-600" />,
      text: "Help me set a realistic goal — I want to get more active but don't know where to start",
    },
    {
      icon: <Wind className="w-5 h-5 text-teal-600" />,
      text: "I'd like to try a body scan or breathing exercise to wind down tonight",
    },
  ]

  return (
    <div className="flex flex-col items-center py-12 px-6 animate-fade-in-up">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-teal-700 to-teal-900 shadow-premium flex items-center justify-center text-white text-3xl font-bold mb-6 border-2 border-teal-600/50 relative">
        <div className="absolute inset-0 rounded-full bg-white opacity-10 blur-xl"></div>
        <span className="relative">F</span>
      </div>
      <h2 className="text-2xl font-bold text-teal-900 mb-2 tracking-tight">Hi, I'm Fitz</h2>
      <p className="text-base text-teal-700 max-w-sm text-center mb-3 leading-relaxed">
        Your health and wellbeing coach. I'm here to help with how you're feeling —
        not just physically, but emotionally and socially too.
      </p>
      <p className="text-[13px] text-teal-600/70 max-w-xs text-center mb-10 leading-relaxed font-medium">
        I'm an AI coach, not a therapist. For exercise programmes and training advice, talk to Rex.
      </p>

      {/* What Fitz is good at */}
      <div className="w-full max-w-sm bg-white/70 backdrop-blur-sm border border-teal-100/50 rounded-2xl p-5 mb-8 shadow-sm">
        <p className="text-[11px] font-bold text-teal-600/80 uppercase tracking-widest mb-4">
          What I can help with
        </p>
        <ul className="space-y-3 text-[14px] text-teal-800 font-medium">
          <li className="flex gap-3 items-center"><MessageCircle className="w-5 h-5 text-teal-500" /><span>Talking through stress or low mood</span></li>
          <li className="flex gap-3 items-center"><Target className="w-5 h-5 text-teal-500" /><span>Setting meaningful goals</span></li>
          <li className="flex gap-3 items-center"><Moon className="w-5 h-5 text-teal-500" /><span>Sleep and recovery check-ins</span></li>
          <li className="flex gap-3 items-center"><Wind className="w-5 h-5 text-teal-500" /><span>Guided mindfulness exercises</span></li>
          <li className="flex gap-3 items-center"><HeartHandshake className="w-5 h-5 text-teal-500" /><span>Social wellbeing support</span></li>
        </ul>
      </div>

      {/* Suggestion chips */}
      <div className="w-full max-w-md">
        <p className="text-[11px] font-bold text-teal-600/70 text-center mb-4 uppercase tracking-widest">
          Try saying…
        </p>
        <div className="space-y-3">
          {SUGGESTIONS.map((s, i) => (
            <button
              key={i}
              onClick={() => onPrompt(s.text)}
              className="w-full text-left text-[14px] font-medium bg-white/70 backdrop-blur-sm border border-white/80 shadow-sm hover:shadow-md hover:-translate-y-0.5 text-teal-800 px-5 py-3.5 rounded-xl transition-all duration-200 flex items-center gap-3"
            >
              <div className="flex-shrink-0">{s.icon}</div>
              <span>{s.text}</span>
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

      let processedReply = reply
      let addSessionAction = null

      const sessionMatch = processedReply.match(/<ADD_SESSION>([\s\S]*?)<\/ADD_SESSION>/)
      if (sessionMatch) {
        try {
          addSessionAction = JSON.parse(sessionMatch[1])
        } catch(e) {
          console.error("Failed to parse ADD_SESSION JSON", e)
        }
        processedReply = processedReply.replace(/<ADD_SESSION>[\s\S]*?<\/ADD_SESSION>/g, '').trim()
      }

      const assistantMsg = { role: 'assistant', content: processedReply, scriptData, plannerAction, addSessionAction }
      // API history stores only clean text — no marker fields
      apiMessages.current = [...newApiMessages, { role: 'assistant', content: processedReply }]
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
    <div className="flex flex-col h-full relative bg-gradient-to-b from-[#f2f7f6] to-[#e6efed]">
      {/* ── Background decoration ─────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#0d9488] opacity-[0.03] blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#0f766e] opacity-[0.03] blur-[100px] rounded-full"></div>
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-md border-b border-teal-100/50 px-5 py-4 flex items-center gap-3 flex-shrink-0 shadow-sm relative z-10">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center text-white font-bold shadow-lg shadow-teal-700/20">
          F
        </div>
        <div>
          <p className="text-teal-600/80 text-xs font-bold uppercase tracking-widest">Your Wellbeing Coach</p>
        </div>
      </div>

      {/* ── Crisis disclaimer ───────────────────────────────────── */}
      <div className="bg-amber-50/90 backdrop-blur-sm border-b border-amber-200/60 px-4 py-2.5 flex-shrink-0 relative z-10">
        <p className="text-[13px] text-amber-800 text-center font-medium">
          <strong>In crisis?</strong> Call {crisisLine.name}: <strong>{crisisLine.number}</strong> — free and available 24/7
        </p>
      </div>

      {/* ── Chat messages ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pt-4 pb-36 relative z-10">
        <div className="max-w-2xl mx-auto py-4">
          {messages.length === 0 && !sending && <EmptyState onPrompt={text => sendMessage(text)} />}
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} scriptData={msg.scriptData} plannerAction={msg.plannerAction} addSessionAction={msg.addSessionAction} userId={userId} />
          ))}
          {sending && <TypingIndicator />}
          <div ref={bottomRef} className="h-24" />
        </div>
      </div>

      {/* ── Input bar (Floating Glassmorphic) ───────────────────── */}
      <div className="absolute bottom-6 left-0 right-0 px-4 sm:px-6 z-20 pointer-events-none">
        <div className="max-w-2xl mx-auto pointer-events-auto bg-white/70 backdrop-blur-xl border border-white/50 shadow-premium rounded-2xl overflow-hidden transition-all duration-300">
          <div className="px-4 py-3 sm:p-4">
            {error && (
              <p className="text-red-500 text-[13px] font-medium mb-3 bg-red-50/80 border border-red-100 rounded-xl px-3 py-2 animate-fade-in-up">
                {error}
              </p>
            )}
            <div className="flex gap-2 sm:gap-3 items-end relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Message Fitz…"
                rows={1}
                disabled={sending}
                className="flex-1 resize-none overflow-hidden bg-white/50 focus:bg-white rounded-xl border border-teal-200/50 px-4 py-3 text-[15px] text-teal-900 placeholder-teal-600/50 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500/30 disabled:opacity-50 transition-all duration-200 leading-relaxed shadow-sm"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || sending}
                className="bg-gradient-to-br from-teal-600 to-teal-800 hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:-translate-y-0 disabled:active:translate-y-0 text-white rounded-xl px-5 py-3 text-[15px] font-semibold transition-all duration-200 flex-shrink-0"
              >
                Send
              </button>
            </div>
            <div className="flex justify-between items-center mt-2 px-1">
              <p className="text-[11px] text-teal-600/70 font-bold uppercase tracking-widest">
                Enter to send · Shift+Enter for new line
              </p>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-[11px] font-bold text-teal-600/70 hover:text-teal-800 transition-colors uppercase tracking-widest"
                >
                  Clear Chat
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
