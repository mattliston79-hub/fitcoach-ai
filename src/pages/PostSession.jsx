import { useState, useEffect } from 'react'
import { useNavigate, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { checkAndAwardBadges } from '../lib/checkBadges'

// ── Session type metadata ───────────────────────────────────────────────────
const TYPE_META = {
  kettlebell:      { icon: '🏋️', label: 'Kettlebell'   },
  hiit_bodyweight: { icon: '⚡', label: 'HIIT'          },
  yoga:            { icon: '🧘', label: 'Yoga'           },
  pilates:         { icon: '🩰', label: 'Pilates'        },
  plyometrics:     { icon: '⚡', label: 'Plyometrics'   },
  coordination:    { icon: '🎯', label: 'Coordination'  },
  flexibility:     { icon: '🌿', label: 'Flexibility'   },
  gym_strength:    { icon: '🏋️', label: 'Gym Strength'  },
}
const DEFAULT_META = { icon: '💪', label: 'Session' }

// ── Main component ──────────────────────────────────────────────────────────
export default function PostSession() {
  const { loggedSessionId } = useParams()
  const { state }  = useLocation()
  const navigate   = useNavigate()
  const { session: authSession } = useAuth()
  const userId     = authSession.user.id

  // Route state from the loggers
  const {
    title        = 'Session',
    sessionType  = '',
    durationMins = 0,
    exerciseCount= 0,
    setsCount    = 0,
    setsLabel    = 'sets',
    newPRs       = [],        // [{exercise_name, weight_kg, reps, one_rep_max_kg, previous_orm}]
  } = state ?? {}

  const meta = TYPE_META[sessionType] ?? DEFAULT_META

  // Entrance animation
  const [show, setShow] = useState(false)
  useEffect(() => {
    requestAnimationFrame(() => setShow(true))
  }, [])

  // Badge check
  const [badges, setBadges]         = useState([])
  const [badgeVisible, setBadgeVisible] = useState(false)
  const [badgeChecked, setBadgeChecked] = useState(false)

  useEffect(() => {
    const startedAt = Date.now()
    checkAndAwardBadges(userId, sessionType, { hasNewPr: newPRs.length > 0 }).then(newBadges => {
      setBadgeChecked(true)
      if (!newBadges.length) return
      setBadges(newBadges)
      const elapsed = Date.now() - startedAt
      const delay   = Math.max(0, 600 - elapsed)
      setTimeout(() => setBadgeVisible(true), delay)
    })
  }, [userId, sessionType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fitz debrief message
  const typeLabel  = meta.label.toLowerCase()
  const fitzMessage = `I just finished my ${title} — ${durationMins} min ${typeLabel} session with ${exerciseCount} exercise${exerciseCount !== 1 ? 's' : ''}. Can we debrief?`

  const goToFitz = () => {
    navigate('/chat/fitz', { state: { initialMessage: fitzMessage } })
  }

  return (
    <div className="h-dvh flex flex-col items-center justify-center bg-[#FAFAF7] px-5 pb-8 pt-6 overflow-y-auto">

      {/* ── Summary card ── */}
      <div
        className="w-full max-w-sm"
        style={{
          opacity:   show ? 1 : 0,
          transform: show ? 'translateY(0)' : 'translateY(20px)',
          transition: 'opacity 0.4s ease, transform 0.4s ease',
        }}
      >
        {/* Icon + headline */}
        <div className="text-center mb-6">
          <div className="text-6xl mb-3">{meta.icon}</div>
          <h1 className="text-2xl font-bold text-slate-800 leading-tight">Session Complete!</h1>
          <p className="text-sm text-slate-500 mt-1">{title}</p>
        </div>

        {/* Stats row */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 grid grid-cols-3 gap-0 divide-x divide-gray-100 mb-5">
          <div className="text-center pr-4">
            <p className="text-2xl font-bold text-teal-600 leading-none">{durationMins}</p>
            <p className="text-xs text-gray-400 mt-1">mins</p>
          </div>
          <div className="text-center px-4">
            <p className="text-2xl font-bold text-slate-700 leading-none">{exerciseCount}</p>
            <p className="text-xs text-gray-400 mt-1">exercises</p>
          </div>
          <div className="text-center pl-4">
            <p className="text-2xl font-bold text-slate-700 leading-none">{setsCount}</p>
            <p className="text-xs text-gray-400 mt-1">{setsLabel}</p>
          </div>
        </div>

        {/* PR celebration — shown immediately (data came from SessionLogger) */}
        {newPRs.length > 0 && (
          <div
            className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-4"
            style={{ animation: 'fadeSlideUp 0.4s ease 0.3s both' }}
          >
            <p className="text-xs font-semibold text-rose-600 uppercase tracking-wide mb-3 text-center">
              🏆 Personal record{newPRs.length > 1 ? 's' : ''} broken!
            </p>
            <div className="space-y-2.5">
              {newPRs.map((pr, i) => (
                <div key={i} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 capitalize truncate">
                      {pr.exercise_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {pr.weight_kg} kg × {pr.reps} rep{pr.reps !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-rose-600">
                      {pr.one_rep_max_kg} kg
                    </p>
                    <p className="text-xs text-slate-400">
                      {pr.previous_orm ? `↑ from ${pr.previous_orm}` : 'First PR!'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400 text-center mt-3">estimated 1-rep max</p>
          </div>
        )}

        {/* Badge celebration — shown after check */}
        {badgeVisible && badges.length > 0 && (
          <div
            className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5 text-center"
            style={{ animation: 'fadeSlideUp 0.4s ease' }}
          >
            <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">
              🎉 New badge{badges.length > 1 ? 's' : ''} earned!
            </p>
            {badges.map(b => (
              <div key={b.id} className="flex items-center gap-3 justify-center mt-1">
                <span className="text-2xl">{b.icon_emoji}</span>
                <div className="text-left">
                  <p className="text-sm font-bold text-slate-800">{b.name}</p>
                  <p className="text-xs text-slate-500">{b.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-3">
          <button
            onClick={goToFitz}
            className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white font-bold py-4 rounded-2xl text-sm transition-colors shadow-sm"
          >
            <span className="mr-1.5">💬</span>
            Debrief with Fitz
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full bg-white border border-gray-200 hover:bg-gray-50 active:bg-gray-100 text-slate-700 font-semibold py-4 rounded-2xl text-sm transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
