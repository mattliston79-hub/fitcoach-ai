import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { askRex, makeClaudeCall } from '../coach/claudeApi'
import { buildSessionSequentially } from '../coach/buildSessionSequentially'
import { supabase } from '../lib/supabase'
import { saveConversationSummary } from '../coach/conversationMemory'
import { generateSingleSession, generateRexPlan } from '../coach/rexOrchestrator'
import { Home, Activity, Dumbbell, LineChart } from 'lucide-react'


// ── Constraint extraction helper ──────────────────────────────────────────
function parseConstraints(rawResponse) {
  if (!rawResponse) return null

  try {
    // First attempt: direct parse
    return JSON.parse(rawResponse.trim())
  } catch (e) {
    // Second attempt: extract JSON object from within the response —
    // handles cases where Claude adds a sentence before or after the JSON
    const match = rawResponse.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(match[0])
      } catch (e2) {
        console.error('[Rex] constraint extraction: could not parse extracted JSON', match[0])
        return null
      }
    }
    console.error('[Rex] constraint extraction: no JSON object found in response', rawResponse)
    return null
  }
}

// ── Quick-prompt chips shown in the empty state ────────────────────────────
const QUICK_PROMPTS = [
  {
    icon: <Home className="w-5 h-5 text-slate-500" />,
    label: 'Start training at home',
    text: "I want to start getting fitter at home — I don't have any gym equipment. Can you build me a simple beginner programme?",
  },
  {
    icon: <Activity className="w-5 h-5 text-slate-500" />,
    label: 'Help me get to 5K',
    text: "I want to go from barely running to completing a 5K. Can you build me a couch-to-5K style plan?",
  },
  {
    icon: <Dumbbell className="w-5 h-5 text-slate-500" />,
    label: 'First time at the gym',
    text: "I want to start going to the gym but I don't really know where to begin. Can you help?",
  },
  {
    icon: <LineChart className="w-5 h-5 text-slate-500" />,
    label: 'Am I overtraining?',
    text: 'Based on my recent sessions and recovery scores, am I at risk of overtraining?',
  },
]

// ── Typing indicator ───────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-6 px-4 sm:px-6 animate-fade-in-up">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 shadow-md flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0 mt-0.5 border border-slate-600/50">
        R
      </div>
      <div className="bg-white/80 backdrop-blur-md border border-white/60 shadow-sm rounded-2xl rounded-tl-sm px-5 py-4">
        <div className="flex gap-1.5 items-center h-4">
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
    <div className={`flex ${isRex ? 'justify-start' : 'justify-end'} mb-6 px-4 sm:px-6 animate-fade-in-up`}>
      {isRex && (
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 shadow-md flex items-center justify-center text-white text-sm font-bold mr-3 flex-shrink-0 mt-0.5 border border-slate-600/50">
          R
        </div>
      )}
      <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-5 py-3.5 text-[15px] whitespace-pre-wrap leading-[1.6] tracking-tight ${
        isRex
          ? 'bg-white/80 backdrop-blur-md border border-white/60 text-slate-800 shadow-sm rounded-tl-sm'
          : 'bg-gradient-to-br from-[#1A3A5C] to-[#2a5a8c] text-white shadow-premium-sm rounded-tr-sm border border-[#152f4c]'
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
    <div className="flex flex-col items-center py-12 px-6 animate-fade-in-up">
      <div className="w-20 h-20 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 shadow-premium flex items-center justify-center text-white text-3xl font-bold mb-6 border-2 border-slate-700/50 relative">
        <div className="absolute inset-0 rounded-full bg-white opacity-10 blur-xl"></div>
        <span className="relative">R</span>
      </div>
      <h2 className="text-2xl font-bold text-slate-800 mb-2 tracking-tight">Hi, I'm Rex</h2>
      <p className="text-base text-slate-500 max-w-sm text-center mb-3 leading-relaxed">
        Your AI personal trainer. Tell me your goals, available time, and equipment —
        and I'll build you a programme and guide you through it.
      </p>
      <p className="text-[13px] text-slate-400 max-w-xs text-center mb-10 leading-relaxed font-medium">
        For emotional or mental wellbeing support, talk to Fitz.
      </p>

      {/* ── What Rex can see ──────────────────────────────────── */}
      {profile && (
        <div className="w-full max-w-md bg-white/60 backdrop-blur-md border border-white/80 shadow-premium-sm rounded-2xl p-5 mb-8">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">
            What I can see
          </p>
          <div className="space-y-3">
            {profile.experience_level && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-500 text-sm border border-blue-100/50">🎯</div>
                <span className="text-[14px] text-slate-700">
                  <span className="font-semibold capitalize">{profile.experience_level}</span> level
                </span>
              </div>
            )}
            {profile.preferred_session_types?.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 text-sm border border-emerald-100/50">🏋️</div>
                <span className="text-[14px] text-slate-700">
                  Trains: <span className="font-semibold">{profile.preferred_session_types.map(t => t.replace(/_/g, ' ')).join(', ')}</span>
                </span>
              </div>
            )}
            {profile.available_days?.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-500 text-sm border border-amber-100/50">📅</div>
                <span className="text-[14px] text-slate-700">
                  <span className="font-semibold">{profile.available_days.length} days/week</span>
                  {profile.preferred_session_duration_mins && (
                    <> · <span className="font-semibold">{profile.preferred_session_duration_mins} min</span> sessions</>
                  )}
                </span>
              </div>
            )}
            {goalCount > 0 && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-500 text-sm border border-purple-100/50">📋</div>
                <span className="text-[14px] text-slate-700">
                  <span className="font-semibold">{goalCount} active goal{goalCount !== 1 ? 's' : ''}</span>
                </span>
              </div>
            )}
            {lastSession && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 text-sm border border-rose-100/50">⚡</div>
                <span className="text-[14px] text-slate-700">
                  Last session: <span className="font-semibold capitalize">{lastSession.replace(/_/g, ' ')}</span>
                </span>
              </div>
            )}
            {!profile.experience_level && !goalCount && (
              <p className="text-[13px] text-slate-400 italic">Complete onboarding to unlock full personalisation.</p>
            )}
          </div>
        </div>
      )}

      {/* ── Quick prompt chips ────────────────────────────────── */}
      <div className="w-full max-w-md">
        <p className="text-[11px] font-bold text-slate-400 text-center mb-4 uppercase tracking-widest">Try asking me…</p>
        <div className="space-y-3">
          {QUICK_PROMPTS.map(p => (
            <button
              key={p.label}
              onClick={() => onPrompt(p.text)}
              className="w-full text-left text-[14px] font-medium bg-white/70 backdrop-blur-sm border border-white/80 shadow-sm hover:shadow-md hover:-translate-y-0.5 text-slate-700 px-5 py-3.5 rounded-xl transition-all duration-200 flex items-center gap-3"
            >
              {p.icon}
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
  const userId   = session.user.id
  const navigate = useNavigate()

  const [messages, setMessages]   = useState([])
  const apiMessages               = useRef([])
  const [input, setInput]         = useState('')
  const [sending, setSending]     = useState(false)
  const [error, setError]         = useState('')
  const [context, setContext]     = useState({ profile: null, goalCount: 0, lastSession: null })
  const [crisisLine, setCrisisLine] = useState({ name: 'Samaritans', number: '116 123' })

  const [buildState, setBuildState]       = useState('idle')
  // 'idle' | 'extracting' | 'building' | 'checking' | 'done' | 'error'
  const [buildProgress, setBuildProgress] = useState({ current: 0, total: 0 })
  const [buildErrors, setBuildErrors]     = useState([])
  const [complianceIssues, setComplianceIssues] = useState([])

  const [showInjuryAssessment, setShowInjuryAssessment] = useState(false)
  const [pendingBuild, setPendingBuild]                 = useState(false)
  const [injuryEntries, setInjuryEntries]               = useState([
    { bodyArea: '', painScore: null, romScore: null }
  ])
  const [savingInjury, setSavingInjury]                 = useState(false)

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
    let singleSessionsToBuild = null
    try {
      const { reply, planBuildTriggered, singleSessionTriggered } = await askRex(userId, newApiMessages, 'open_chat')
      planTriggered = !!planBuildTriggered
      if (singleSessionTriggered && singleSessionTriggered.length > 0) {
        singleSessionsToBuild = singleSessionTriggered
      }
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

    // If Rex triggered a full programme build, show the injury assessment overlay
    if (planTriggered) {
      setInjuryEntries([{ bodyArea: '', painScore: null, romScore: null }])
      setShowInjuryAssessment(true)
      setPendingBuild(true)
    } else if (singleSessionsToBuild) {
      // If Rex triggered one or more single sessions, build them immediately
      buildSingleSessions(singleSessionsToBuild)
    }
  }

  // ── Single Session Builder ─────────────────────────────────────────────
  const buildSingleSessions = async (sessions) => {
    setBuildErrors([])
    setComplianceIssues([])
    setBuildState('building')
    setBuildProgress({ current: 0, total: sessions.length })

    try {
      for (let i = 0; i < sessions.length; i++) {
        setBuildProgress({ current: i + 1, total: sessions.length })
        await generateSingleSession(userId, supabase, makeClaudeCall, sessions[i])
      }
      setBuildState('done')
      setTimeout(() => setBuildState('idle'), 3000)
    } catch (err) {
      console.error('[RexChat] Single session build failed:', err)
      setBuildErrors([err.message])
      setBuildState('error')
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── 3-Phase Programme Builder ───────────────────────────────────────────
  const startBuild = useCallback(async () => {
    setBuildErrors([])
    setComplianceIssues([])

    try {
      setBuildState('extracting') // Represents Architect phase
      
      await generateRexPlan(userId, supabase, makeClaudeCall, (phase, current, total) => {
        if (phase === 'architect') {
          setBuildState('extracting')
        } else if (phase === 'builder') {
          setBuildState('building')
          setBuildProgress({ current: current ?? 0, total: total ?? 4 })
        } else if (phase === 'saving') {
          setBuildState('checking')
        }
      })

      setBuildState('done')
    } catch (err) {
      console.error('[RexChat] startBuild fatal error:', err)
      setBuildErrors([err.message])
      setBuildState('error')
    } finally {
      setPendingBuild(false)
    }
  }, [userId])

  // ── Injury assessment handlers ────────────────────────────────────────────
  const handleInjuryAssessmentComplete = useCallback(async () => {
    setSavingInjury(true)
    try {
      const validEntries = injuryEntries.filter(
        e => e.bodyArea.trim() && (e.painScore !== null || e.romScore !== null)
      )
      if (validEntries.length > 0) {
        const rows = validEntries.map(e => {
          const severity =
            (e.painScore ?? 0) >= 4 ? 'severe' :
            (e.painScore ?? 0) >= 2 ? 'moderate' : 'mild'
          const painDesc = e.painScore !== null ? `Pain: ${e.painScore}/5` : null
          const romDesc  = e.romScore  !== null ? `ROM: ${e.romScore}/5`   : null
          const note = [painDesc, romDesc].filter(Boolean).join(', ')
          return {
            user_id:   userId,
            category:  'injury',
            body_area: e.bodyArea.trim(),
            note,
            severity,
            active:    true,
          }
        })
        await supabase.from('rex_coaching_notes').insert(rows)
      }
    } catch (err) {
      console.error('[RexChat] injury save failed:', err)
      // Non-fatal — proceed with build anyway
    } finally {
      setSavingInjury(false)
      setShowInjuryAssessment(false)
      await startBuild()
    }
  }, [injuryEntries, userId, startBuild])

  const handleInjuryAssessmentSkip = useCallback(async () => {
    setShowInjuryAssessment(false)
    await startBuild()
  }, [startBuild])

  // ── Rebuild plan ──────────────────────────────────────────────────────────
  const isBuilding = !['idle', 'done', 'error'].includes(buildState)
  const rebuildPlan = () => {
    if (isBuilding || sending) return
    setError('')
    setBuildState('idle')
    setBuildErrors([])
    setComplianceIssues([])
    setInjuryEntries([{ bodyArea: '', painScore: null, romScore: null }])
    setShowInjuryAssessment(true)
    setPendingBuild(true)
  }

  return (
    <div className="flex flex-col h-full relative bg-gradient-to-b from-[var(--color-sand-50)] to-[#e8ecef]">
      {/* ── Background decoration ─────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-[#1A3A5C] opacity-[0.03] blur-[100px] rounded-full"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-[#2a5a8c] opacity-[0.03] blur-[100px] rounded-full"></div>
      </div>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-5 py-4 flex items-center gap-3 flex-shrink-0 shadow-sm relative z-10">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#1A3A5C] to-[#2a5a8c] flex items-center justify-center text-white font-bold shadow-lg shadow-[#1A3A5C]/20">
          R
        </div>
        <div className="flex-1">
          <p className="text-slate-400 text-xs">Your AI Personal Trainer</p>
        </div>
        <button
          onClick={rebuildPlan}
          disabled={isBuilding || sending}
          className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors"
        >
          {isBuilding ? (
            <>
              <span className="w-3 h-3 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
              {buildState === 'extracting' ? 'Thinking…' :
               buildState === 'checking'   ? 'Checking…' :
               buildState === 'building'   ? `Building ${buildProgress.current}/${buildProgress.total}…` :
               'Building…'}
            </>
          ) : (
            <>↺ Rebuild plan</>
          )}
        </button>
      </div>


      {/* ── Crisis disclaimer ───────────────────────────────────── */}
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex-shrink-0">
        <p className="text-xs text-amber-800 text-center">
          <strong>In crisis?</strong> Call {crisisLine.name}: <strong>{crisisLine.number}</strong> — free and available 24/7
        </p>
      </div>

      {/* ── Chat messages ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pt-4 pb-36 relative z-10">
        <div className="max-w-2xl mx-auto py-4">
          {messages.length === 0 && !sending && (
            <EmptyState context={context} onPrompt={sendMessage} />
          )}
          {messages.map((msg, i) => (
            <ChatMessage key={i} role={msg.role} content={msg.content} />
          ))}
          {sending && <TypingIndicator />}
          {/* ── Build state UI ──────────────────────────────────── */}
          {buildState !== 'idle' && (
            <div className="mx-4 mb-4">

              {/* In-progress states */}
              {(buildState === 'extracting' || buildState === 'building' || buildState === 'checking') && (
                <div className="flex items-start gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <span className="w-4 h-4 mt-0.5 border-2 border-[#1A3A5C]/30 border-t-[#1A3A5C] rounded-full animate-spin flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">
                      {buildState === 'extracting' && 'Rex is thinking through your week…'}
                      {buildState === 'checking'   && 'Checking your programme…'}
                      {buildState === 'building'   && `Building session ${buildProgress.current} of ${buildProgress.total}…`}
                    </p>
                    {buildState === 'building' && buildProgress.total > 0 && (
                      <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1A3A5C] rounded-full transition-all duration-300"
                          style={{ width: `${(buildProgress.current / buildProgress.total) * 100}%` }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Done state */}
              {buildState === 'done' && (
                <div className="bg-white border border-slate-200 rounded-xl px-4 py-4 shadow-sm">
                  <p className="font-semibold text-slate-900 mb-3">Your programme is ready.</p>
                  {complianceIssues.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                      <p className="text-xs font-semibold text-amber-800 mb-1">Rex flagged some issues:</p>
                      <ul className="space-y-0.5">
                        {complianceIssues.map((issue, i) => (
                          <li key={i} className="text-xs text-amber-700">• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {buildErrors.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                      <p className="text-xs text-amber-700">
                        Rex had trouble building {buildErrors.length} session{buildErrors.length !== 1 ? 's' : ''}. You can ask Rex to fix these in the planner.
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => navigate('/planner')}
                    className="w-full bg-[#1A3A5C] hover:bg-[#0f2540] text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                  >
                    View your programme →
                  </button>
                </div>
              )}

              {/* Error state */}
              {buildState === 'error' && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-4">
                  {buildErrors[0] === 'extraction_failed' ? (
                    <>
                      <p className="text-sm text-red-700 leading-relaxed mb-3">
                        Rex couldn't read the plan details from your conversation. Try summarising what you'd like — for example: <span className="italic">"4 days a week, upper/lower split, 45 minutes, dumbbells only"</span> — and ask Rex to build again.
                      </p>
                      <button
                        onClick={() => { setBuildState('idle'); setBuildErrors([]) }}
                        className="text-xs font-semibold text-red-700 underline"
                      >
                        Start over
                      </button>
                    </>
                  ) : (
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-red-700">Something went wrong building your programme.</p>
                      <button
                        onClick={rebuildPlan}
                        className="text-xs font-semibold text-red-700 underline ml-3 flex-shrink-0"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              )}

            </div>
          )}
          <div ref={bottomRef} className="h-24" />
        </div>
      </div>

      {/* ── Injury assessment overlay ───────────────────────────── */}
      {showInjuryAssessment && (
        <div className="absolute inset-0 z-50 bg-black/60 flex items-end justify-center">
          <div className="bg-[#0f2540] w-full max-w-lg rounded-t-2xl px-5 pt-5 pb-8 shadow-2xl max-h-[90vh] overflow-y-auto">

            {/* Header */}
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                R
              </div>
              <div>
                <p className="text-white font-semibold text-sm leading-tight">Before I build your programme…</p>
                <p className="text-slate-400 text-xs mt-0.5">
                  Any current injuries or pain I should know about? This helps me programme safely.
                </p>
              </div>
            </div>

            {/* Entries */}
            <div className="flex flex-col gap-4 mb-4">
              {injuryEntries.map((entry, idx) => (
                <div key={idx} className="bg-[#1A3A5C] rounded-xl px-4 py-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-slate-300 text-xs font-medium">Area {idx + 1}</p>
                    {injuryEntries.length > 1 && (
                      <button
                        onClick={() => setInjuryEntries(prev => prev.filter((_, i) => i !== idx))}
                        className="text-slate-500 text-xs hover:text-red-400 transition-colors"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Body area input */}
                  <input
                    type="text"
                    placeholder="e.g. left shoulder, lower back, right knee"
                    value={entry.bodyArea}
                    onChange={e => setInjuryEntries(prev =>
                      prev.map((en, i) => i === idx ? { ...en, bodyArea: e.target.value } : en)
                    )}
                    className="w-full bg-[#0f2540] text-slate-200 placeholder-slate-500 text-sm rounded-lg px-3 py-2 border border-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500 mb-3"
                  />

                  {/* Pain score */}
                  <p className="text-slate-400 text-xs mb-1.5">Pain level (0 = none, 5 = severe)</p>
                  <div className="flex gap-1.5 mb-3">
                    {[0, 1, 2, 3, 4, 5].map(v => (
                      <button
                        key={v}
                        onClick={() => setInjuryEntries(prev =>
                          prev.map((en, i) => i === idx ? { ...en, painScore: v } : en)
                        )}
                        className={[
                          'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                          entry.painScore === v
                            ? 'bg-teal-500 text-white'
                            : 'bg-[#0f2540] text-slate-400 hover:bg-slate-700',
                        ].join(' ')}
                      >
                        {v}
                      </button>
                    ))}
                  </div>

                  {/* ROM score */}
                  <p className="text-slate-400 text-xs mb-1.5">Range of motion (0 = very restricted, 5 = full)</p>
                  <div className="flex gap-1.5">
                    {[0, 1, 2, 3, 4, 5].map(v => (
                      <button
                        key={v}
                        onClick={() => setInjuryEntries(prev =>
                          prev.map((en, i) => i === idx ? { ...en, romScore: v } : en)
                        )}
                        className={[
                          'flex-1 rounded-lg py-1.5 text-xs font-semibold transition-colors',
                          entry.romScore === v
                            ? 'bg-teal-500 text-white'
                            : 'bg-[#0f2540] text-slate-400 hover:bg-slate-700',
                        ].join(' ')}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Add another area */}
            <button
              onClick={() => setInjuryEntries(prev => [...prev, { bodyArea: '', painScore: null, romScore: null }])}
              className="w-full text-teal-400 text-xs py-2 hover:text-teal-300 transition-colors mb-4"
            >
              + Add another area
            </button>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <button
                onClick={handleInjuryAssessmentComplete}
                disabled={savingInjury}
                className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
              >
                {savingInjury ? 'Saving…' : 'Save and build programme'}
              </button>
              <button
                onClick={handleInjuryAssessmentSkip}
                disabled={savingInjury}
                className="w-full text-slate-400 text-xs py-1.5 hover:text-slate-300 transition-colors"
              >
                No injuries — build programme
              </button>
            </div>
          </div>
        </div>
      )}
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
                placeholder="Message Rex…"
                rows={1}
                disabled={sending}
                className="flex-1 resize-none overflow-hidden bg-white/50 focus:bg-white rounded-xl border border-slate-200/50 px-4 py-3 text-[15px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1A3A5C]/20 focus:border-[#1A3A5C]/30 disabled:opacity-50 transition-all duration-200 leading-relaxed shadow-sm"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || sending}
                className="bg-gradient-to-br from-[#1A3A5C] to-[#2a5a8c] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:hover:shadow-none disabled:hover:-translate-y-0 disabled:active:translate-y-0 text-white rounded-xl px-5 py-3 text-[15px] font-semibold transition-all duration-200 flex-shrink-0"
              >
                Send
              </button>
            </div>
            <div className="flex justify-between items-center mt-2 px-1">
              <p className="text-[11px] text-slate-400 font-medium tracking-wide">
                Enter to send · Shift+Enter for new line
              </p>
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-[11px] font-semibold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
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
