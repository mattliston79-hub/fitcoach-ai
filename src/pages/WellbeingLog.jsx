import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculateOakTreeState } from '../utils/oakTreeState'

// ── Slider ──────────────────────────────────────────────────────────────────
function ScoreSlider({ value, onChange, minLabel, maxLabel, accent }) {
  const colours = {
    teal:  { track: 'accent-teal-500',  dot: 'bg-teal-500'  },
    blue:  { track: 'accent-blue-500',  dot: 'bg-blue-500'  },
    amber: { track: 'accent-amber-500', dot: 'bg-amber-500' },
  }
  const c = colours[accent] ?? colours.teal

  return (
    <div>
      <input
        type="range"
        min={1}
        max={5}
        step={1}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className={`w-full h-2 rounded-full cursor-pointer ${c.track}`}
      />
      <div className="flex justify-between mt-1">
        <span className="text-xs text-gray-400">{minLabel}</span>
        <span className="text-xs text-gray-400">{maxLabel}</span>
      </div>
    </div>
  )
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, accent, children }) {
  const border = {
    teal:  'border-teal-200',
    blue:  'border-blue-200',
    amber: 'border-amber-200',
  }[accent] ?? 'border-gray-200'

  const heading = {
    teal:  'text-teal-700',
    blue:  'text-blue-700',
    amber: 'text-amber-700',
  }[accent] ?? 'text-gray-700'

  return (
    <div className={`bg-white rounded-2xl border ${border} shadow-sm p-5 mb-4`}>
      <h2 className={`text-xs font-semibold uppercase tracking-wide mb-4 ${heading}`}>{title}</h2>
      {children}
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────
export default function WellbeingLog() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const userId      = session.user.id

  // Physical
  const [energy,   setEnergy]   = useState(3)
  const [soreness, setSoreness] = useState(3)

  // Emotional
  const [mood,  setMood]  = useState(3)
  const [sleep, setSleep] = useState(3)

  // Social
  const [socialConnected, setSocialConnected] = useState(null) // null | true | false
  const [socialText, setSocialText]           = useState('')

  // Save state
  const [saving,       setSaving]       = useState(false)
  const [success,      setSuccess]      = useState(false)
  const [error,        setError]        = useState('')
  const [alreadyDone,  setAlreadyDone]  = useState(false)

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    supabase
      .from('wellbeing_logs')
      .select('id')
      .eq('user_id', userId)
      .eq('date', today)
      .limit(1)
      .then(({ data }) => {
        if (data?.length) setAlreadyDone(true)
      })
  }, [userId])

  const handleSave = async () => {
    setSaving(true)
    setError('')

    try {
      const today = new Date().toISOString().slice(0, 10)

      // 1. wellbeing_logs
      const { error: logErr } = await supabase.from('wellbeing_logs').insert({
        user_id:                userId,
        date:                   today,
        mood_score:             mood,
        energy_score:           energy,
        sleep_quality:          sleep,
        social_connection_score: socialConnected ? 5 : 1,
      })
      if (logErr) throw logErr

      // 2. social_activity_logs (only if connected)
      if (socialConnected) {
        const { error: socialErr } = await supabase.from('social_activity_logs').insert({
          user_id:              userId,
          date:                 today,
          activity_description: socialText.trim() || 'Connected with someone today',
          with_others:          true,
        })
        if (socialErr) throw socialErr
      }

      // 3. Recalculate oak tree (fire and forget)
      calculateOakTreeState(userId)

      // 4. Success message then navigate
      setSuccess(true)
      setTimeout(() => navigate('/dashboard'), 1500)
    } catch (err) {
      setError(err.message || 'Something went wrong — please try again')
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-10">
      <div className="max-w-md mx-auto px-4 pt-6">

        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-800">Daily Check-in</h1>
          <p className="text-sm text-gray-400 mt-0.5">Under a minute — how are you today?</p>
        </div>

        {alreadyDone && (
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-5 mb-4 text-center">
            <p className="text-2xl mb-2">🌱</p>
            <p className="text-sm font-semibold text-teal-700">Already logged today</p>
            <p className="text-xs text-teal-500 mt-1">Your tree has been nourished. Come back tomorrow.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="mt-4 text-sm font-semibold text-teal-700 hover:text-teal-900 transition-colors"
            >
              ← Back to dashboard
            </button>
          </div>
        )}

        {!alreadyDone && (<>

        {/* ── Physical ── */}
        <Section title="Physical" accent="teal">
          <div className="space-y-5">
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium text-slate-700">Energy</p>
                <span className="text-sm font-bold text-teal-600">{energy}/5</span>
              </div>
              <ScoreSlider
                value={energy}
                onChange={setEnergy}
                minLabel="Exhausted"
                maxLabel="Full of energy"
                accent="teal"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium text-slate-700">Soreness</p>
                <span className="text-sm font-bold text-teal-600">{soreness}/5</span>
              </div>
              <ScoreSlider
                value={soreness}
                onChange={setSoreness}
                minLabel="Very sore"
                maxLabel="No soreness"
                accent="teal"
              />
            </div>
          </div>
        </Section>

        {/* ── Emotional ── */}
        <Section title="Emotional" accent="blue">
          <div className="space-y-5">
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium text-slate-700">Mood</p>
                <span className="text-sm font-bold text-blue-600">{mood}/5</span>
              </div>
              <ScoreSlider
                value={mood}
                onChange={setMood}
                minLabel="Low"
                maxLabel="Great"
                accent="blue"
              />
            </div>
            <div>
              <div className="flex justify-between items-center mb-2">
                <p className="text-sm font-medium text-slate-700">Sleep last night</p>
                <span className="text-sm font-bold text-blue-600">{sleep}/5</span>
              </div>
              <ScoreSlider
                value={sleep}
                onChange={setSleep}
                minLabel="Terrible"
                maxLabel="Excellent"
                accent="blue"
              />
            </div>
          </div>
        </Section>

        {/* ── Social ── */}
        <Section title="Social" accent="amber">
          <p className="text-sm font-medium text-slate-700 mb-3">
            Did you connect with anyone today?
          </p>
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => setSocialConnected(true)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                socialConnected === true
                  ? 'bg-amber-500 text-white'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-700'
              }`}
            >
              Yes
            </button>
            <button
              onClick={() => { setSocialConnected(false); setSocialText('') }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                socialConnected === false
                  ? 'bg-slate-300 text-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
              }`}
            >
              Not today
            </button>
          </div>

          {socialConnected && (
            <div>
              <input
                type="text"
                value={socialText}
                onChange={e => setSocialText(e.target.value.slice(0, 100))}
                placeholder="What did you do? (optional)"
                className="w-full rounded-xl border border-amber-200 px-3 py-2.5 text-sm text-slate-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
              <p className="text-xs text-gray-400 mt-1 text-right">{socialText.length}/100</p>
            </div>
          )}
        </Section>

        {/* ── Error ── */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
            {error}
          </p>
        )}

        {/* ── Save button ── */}
        <button
          onClick={handleSave}
          disabled={saving || success}
          className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-60 text-white font-bold py-4 rounded-2xl text-sm transition-colors shadow-sm"
        >
          {success
            ? '🌱 Logged. Your tree has been nourished.'
            : saving
              ? 'Saving…'
              : 'Save check-in'}
        </button>
        </>)}

      </div>
    </div>
  )
}
