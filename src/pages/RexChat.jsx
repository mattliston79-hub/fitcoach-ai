import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { askRex } from '../coach/claudeApi'
import { buildSessionSequentially } from '../coach/buildSessionSequentially'
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

    // If Rex triggered a programme build, show the injury assessment overlay first
    if (planTriggered) {
      setInjuryEntries([{ bodyArea: '', painScore: null, romScore: null }])
      setShowInjuryAssessment(true)
      setPendingBuild(true)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // ── Sequential programme builder ─────────────────────────────────────────
  const startBuild = useCallback(async () => {
    setBuildErrors([])
    setComplianceIssues([])

    try {
      // ── Step 1: Extract constraints from conversation ──────────────────
      setBuildState('extracting')
      let constraints = null

      try {
        const recentMessages = apiMessages.current.slice(-20)
        if (recentMessages.length > 0) {
          const extractRes = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system: `You are a data extraction assistant. Read the fitness coaching conversation and extract the agreed programme constraints. Return ONLY valid JSON — no markdown, no preamble:
{
  "sessions_per_week": 4,
  "session_days": ["Monday", "Wednesday", "Friday", "Saturday"],
  "session_types": ["upper_body", "lower_body", "full_body", "mobility"],
  "duration_mins": 45,
  "equipment": ["dumbbells", "resistance_bands"],
  "exclusions": ["no legs on Friday", "avoid overhead pressing"],
  "goal_summary": "Build general strength and improve mobility"
}
Rules:
- session_days must use full day names (Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, Sunday)
- session_types must match session_days in length — one type per day
- session_types values must be from: upper_body, lower_body, full_body, cardio, mobility, kettlebell, hiit_bodyweight, yoga, pilates, plyometrics, coordination, flexibility, gym_strength
- If a field was not discussed, use a sensible default`,
              messages:   recentMessages,
              max_tokens: 500,
              skipTools:  true,
              persona:    'rex',
            }),
          })

          if (extractRes.ok) {
            const extractData = await extractRes.json()
            const cleaned = (extractData.reply || '')
              .replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
            constraints = JSON.parse(cleaned)

            // Save constraints to rex_coaching_notes for future reference
            // Note: table has no note_type column — using category instead
            const { data: savedNote, error: noteErr } = await supabase
              .from('rex_coaching_notes')
              .insert({
                user_id:  userId,
                category: 'programme_constraints',
                note:     JSON.stringify(constraints),
                active:   true,
              })
              .select()
              .single()

            if (noteErr) {
              console.error('[RexChat] coaching notes save failed:', noteErr)
            } else {
              console.log('[RexChat] constraints saved to rex_coaching_notes:', savedNote)
            }

            console.log('[Rex] constraints extracted:', constraints)
          }
        }
      } catch (extractErr) {
        console.error('[RexChat] constraint extraction failed:', extractErr)
        setBuildState('error')
        setBuildErrors(['Could not extract programme constraints from the conversation. Please describe your training plan to Rex and try again.'])
        setPendingBuild(false)
        return
      }

      // Hard-fail if extraction returned no usable session_days
      if (!constraints?.session_days?.length) {
        console.error('[RexChat] constraint extraction returned no session_days:', constraints)
        setBuildState('error')
        setBuildErrors(['Could not determine training days from the conversation. Please tell Rex which days you want to train and try again.'])
        setPendingBuild(false)
        return
      }

      // ── Step 2: Clear existing planned sessions ────────────────────────
      const { error: deleteErr } = await supabase
        .from('sessions_planned')
        .delete()
        .eq('user_id', userId)
        .eq('status', 'planned')
      if (deleteErr) {
        console.error('[RexChat] failed to clear existing planned sessions:', deleteErr)
      }

      // ── Step 3: Build sessions sequentially ───────────────────────────
      setBuildState('building')
      const alreadyBuilt = []
      const total = constraints.session_days.length
      setBuildProgress({ current: 0, total })

      for (let i = 0; i < total; i++) {
        setBuildProgress({ current: i + 1, total })
        const result = await buildSessionSequentially(
          userId, constraints, i, alreadyBuilt, supabase
        )
        if (result.success) {
          alreadyBuilt.push(result.session)
        } else {
          setBuildErrors(prev => [...prev, `Session ${i + 1} failed to build`])
        }
        // Brief pause between calls to avoid rate limiting
        if (i < total - 1) await new Promise(resolve => setTimeout(resolve, 500))
      }

      // ── Step 4: Compliance check ───────────────────────────────────────
      setBuildState('checking')
      try {
        const checkRes = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system: `You are a programme compliance checker. Compare the agreed constraints to the built sessions. Return ONLY valid JSON:
{"passed": true, "issues": []}
or if there are issues:
{"passed": false, "issues": ["description of issue"]}`,
            messages: [{
              role: 'user',
              content:
                `Agreed constraints:\n${JSON.stringify(constraints, null, 2)}\n\n` +
                `Built sessions:\n${JSON.stringify(
                  alreadyBuilt.map(s => ({
                    day:          s.day,
                    session_type: s.session_type,
                    title:        s.title,
                    duration_mins: s.duration_mins,
                  })), null, 2
                )}\n\n` +
                `Check: correct number of sessions built? session types match? exclusions respected?`,
            }],
            max_tokens: 300,
            skipTools:  true,
            persona:    'rex',
          }),
        })

        if (checkRes.ok) {
          const checkData = await checkRes.json()
          const cleaned = (checkData.reply || '')
            .replace(/```[a-z]*\n?/g, '').replace(/```/g, '').trim()
          const check = JSON.parse(cleaned)
          if (!check.passed && check.issues?.length > 0) {
            setComplianceIssues(check.issues)
          }
        }
      } catch (checkErr) {
        console.error('[RexChat] compliance check failed:', checkErr)
      }

      setBuildState('done')
    } catch (err) {
      console.error('[RexChat] startBuild fatal error:', err)
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
    <div className="flex-1 flex flex-col min-h-0 relative">

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
      <div className="flex-1 overflow-y-auto bg-white">
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
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center justify-between">
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
          <div ref={bottomRef} />
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
