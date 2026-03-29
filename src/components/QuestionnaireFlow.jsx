import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PERMA_BLOCKS, IPAQ_QUESTIONS, scorePerma, scoreIpaq } from '../data/questionnaireData'

// ── Scale slider for PERMA questions ───────────────────────────────────────
function ScaleSlider({ value, onChange, scale }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={scale.min}
          max={scale.max}
          step={1}
          value={value ?? Math.round((scale.min + scale.max) / 2)}
          onChange={e => onChange(parseInt(e.target.value, 10))}
          className="w-full accent-teal-600"
        />
        <span className="text-2xl font-bold text-teal-600 w-8 text-center shrink-0">
          {value ?? '—'}
        </span>
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{scale.min} — {scale.lowLabel}</span>
        <span>{scale.highLabel} — {scale.max}</span>
      </div>
    </div>
  )
}

// ── PERMA section ───────────────────────────────────────────────────────────
function PermaSection({ onComplete }) {
  const [blockIndex, setBlockIndex] = useState(0)
  const [responses, setResponses] = useState({})

  const totalBlocks = PERMA_BLOCKS.length
  const block = PERMA_BLOCKS[blockIndex]

  const allAnswered = block.questions.every(q => responses[q.id] !== undefined)

  const handleAnswer = (id, val) => {
    setResponses(prev => ({ ...prev, [id]: val }))
  }

  const handleNext = () => {
    if (blockIndex + 1 < totalBlocks) {
      setBlockIndex(prev => prev + 1)
    } else {
      onComplete(responses)
    }
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>PERMA Wellbeing Check</span>
          <span>{blockIndex + 1} / {totalBlocks}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all"
            style={{ width: `${((blockIndex + 1) / totalBlocks) * 100}%` }}
          />
        </div>
      </div>

      {/* Block instruction */}
      {block.instruction && (
        <p className="text-sm text-gray-500 italic">{block.instruction}</p>
      )}

      {/* Questions */}
      <div className="space-y-6">
        {block.questions.map(q => (
          <div key={q.id} className="space-y-3">
            <p className="text-base text-gray-800 leading-relaxed">{q.text}</p>
            <ScaleSlider
              value={responses[q.id]}
              onChange={val => handleAnswer(q.id, val)}
              scale={block.scale}
            />
          </div>
        ))}
      </div>

      <button
        onClick={handleNext}
        disabled={!allAnswered}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 bg-teal-600 hover:bg-teal-700 text-white"
      >
        {blockIndex + 1 < totalBlocks ? 'Next →' : 'Continue to activity questions →'}
      </button>
    </div>
  )
}

// ── IPAQ section ────────────────────────────────────────────────────────────
function IpaqSection({ onComplete }) {
  const [qIndex, setQIndex] = useState(0)
  const [responses, setResponses] = useState({})

  // Build list of visible questions (skip duration if days = 0)
  const visibleQuestions = IPAQ_QUESTIONS.filter(q => {
    if (!q.dependsOn) return true
    const depVal = parseFloat(responses[q.dependsOn] || 0)
    return depVal > 0
  })

  // Find current question in visible list
  const current = visibleQuestions[qIndex]

  const handleNext = () => {
    if (qIndex + 1 < visibleQuestions.length) {
      setQIndex(prev => prev + 1)
    } else {
      onComplete(responses)
    }
  }

  const canContinue = () => {
    if (!current) return false
    if (current.type === 'days') {
      return responses[current.id] !== undefined && responses[current.id] !== ''
    }
    if (current.type === 'duration') {
      const h = responses[current.hoursId]
      const m = responses[current.minsId]
      return (h !== undefined && h !== '') || (m !== undefined && m !== '')
    }
    return true
  }

  if (!current) return null

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Physical Activity Check</span>
          <span>{qIndex + 1} / {visibleQuestions.length}</span>
        </div>
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 rounded-full transition-all"
            style={{ width: `${((qIndex + 1) / visibleQuestions.length) * 100}%` }}
          />
        </div>
      </div>

      <p className="text-base text-gray-800 leading-relaxed">{current.text}</p>

      {current.type === 'days' && (
        <div>
          <input
            type="number"
            min={0}
            max={7}
            placeholder={current.placeholder || 'Days (0–7)'}
            value={responses[current.id] ?? ''}
            onChange={e => setResponses(prev => ({ ...prev, [current.id]: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
      )}

      {current.type === 'duration' && (
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Hours</label>
            <input
              type="number"
              min={0}
              placeholder="0"
              value={responses[current.hoursId] ?? ''}
              onChange={e => setResponses(prev => ({ ...prev, [current.hoursId]: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-gray-400 mb-1 block">Minutes</label>
            <input
              type="number"
              min={0}
              max={59}
              placeholder="0"
              value={responses[current.minsId] ?? ''}
              onChange={e => setResponses(prev => ({ ...prev, [current.minsId]: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-lg text-center font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      )}

      <button
        onClick={handleNext}
        disabled={!canContinue()}
        className="w-full py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 bg-teal-600 hover:bg-teal-700 text-white"
      >
        {qIndex + 1 < visibleQuestions.length ? 'Next →' : 'Finish →'}
      </button>
    </div>
  )
}

// ── Main QuestionnaireFlow export ───────────────────────────────────────────
export default function QuestionnaireFlow({ onClose }) {
  const { session } = useAuth()
  const userId = session?.user?.id

  const [stage, setStage] = useState('intro') // intro | perma | ipaq | saving | done
  const [permaResponses, setPermaResponses] = useState(null)

  const handlePermaComplete = (responses) => {
    setPermaResponses(responses)
    setStage('ipaq')
  }

  const handleIpaqComplete = async (ipaqResponses) => {
    setStage('saving')

    const permaScores = scorePerma(permaResponses)
    const ipaqScores  = scoreIpaq(ipaqResponses)
    const today       = new Date().toISOString().slice(0, 10)
    const now         = new Date().toISOString()

    try {
      // Save PERMA response
      await supabase.from('questionnaire_responses').insert({
        user_id:            userId,
        questionnaire_type: 'perma',
        responses_json:     permaResponses,
        score_summary:      permaScores,
        completed_at:       now,
      })

      // Save IPAQ response
      await supabase.from('questionnaire_responses').insert({
        user_id:            userId,
        questionnaire_type: 'ipaq',
        responses_json:     ipaqResponses,
        score_summary:      ipaqScores,
        completed_at:       now,
      })

      // Upsert schedule — next due in 28 days
      const nextDue = new Date()
      nextDue.setDate(nextDue.getDate() + 28)
      await supabase.from('questionnaire_schedule').upsert({
        user_id:    userId,
        last_completed_at: now,
        next_due_at: nextDue.toISOString(),
        reminder_dismissed_until: null,
      }, { onConflict: 'user_id' })

      setStage('done')
    } catch (err) {
      console.error('[QuestionnaireFlow] save error:', err)
      setStage('done') // Still show done — don't leave user stranded
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 relative">

        {/* Close button (not shown during saving) */}
        {stage !== 'saving' && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-300 hover:text-gray-500 transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ✕
          </button>
        )}

        {/* INTRO */}
        {stage === 'intro' && (
          <div className="space-y-5">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center text-2xl mx-auto">📊</div>
              <h2 className="text-xl font-bold text-gray-800">Wellbeing check-in</h2>
              <p className="text-sm text-gray-500">Takes about 5–10 minutes. Helps Fitz understand how you're really doing.</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm text-gray-600">
              <p>You'll answer two sets of questions:</p>
              <ul className="space-y-1 ml-2">
                <li>• <strong>Wellbeing</strong> — 23 questions across positive emotion, engagement, relationships, meaning, and accomplishment</li>
                <li>• <strong>Physical activity</strong> — 7–9 questions about your activity in the last 7 days</li>
              </ul>
            </div>
            <p className="text-xs text-gray-400 text-center">
              PERMA Profiler © Butler &amp; Kern 2016. IPAQ Short Form © Craig et al. 2003.
            </p>
            <button
              onClick={() => setStage('perma')}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-teal-600 hover:bg-teal-700 text-white transition-colors"
            >
              Let's go →
            </button>
          </div>
        )}

        {/* PERMA */}
        {stage === 'perma' && (
          <PermaSection onComplete={handlePermaComplete} />
        )}

        {/* IPAQ */}
        {stage === 'ipaq' && (
          <IpaqSection onComplete={handleIpaqComplete} />
        )}

        {/* SAVING */}
        {stage === 'saving' && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-10 h-10 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-500">Saving your responses…</p>
          </div>
        )}

        {/* DONE */}
        {stage === 'done' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-5 text-center">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center text-3xl">✓</div>
            <div>
              <h2 className="text-xl font-bold text-gray-800">All done — thank you</h2>
              <p className="text-sm text-gray-500 mt-1">Your responses have been saved. Fitz will use these to better support you.</p>
            </div>
            <p className="text-xs text-gray-400">Your next check-in is due in 4 weeks.</p>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl font-semibold text-sm bg-teal-600 hover:bg-teal-700 text-white transition-colors"
            >
              Close
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
