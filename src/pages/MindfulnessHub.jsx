import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { MINDFULNESS_PRACTICES } from '../coach/mindfulnessKnowledge'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getWeekDates() {
  const today = new Date()
  const monday = new Date(today)
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7))
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return d.toISOString().slice(0, 10)
  })
}

export default function MindfulnessHub() {
  const { session } = useAuth()
  const userId = session.user.id
  const navigate = useNavigate()

  const weekDates = getWeekDates()

  // openPicker: practice key whose day picker is open, or null
  const [openPicker, setOpenPicker] = useState(null)
  // adding: practice key currently being inserted
  const [adding, setAdding] = useState(null)
  // confirmed: { [practiceKey]: dayLabel } — shows success message
  const [confirmed, setConfirmed] = useState({})

  async function handleSelectDay(practiceKey, dateStr, dayLabel) {
    const practice = MINDFULNESS_PRACTICES[practiceKey]
    setOpenPicker(null)
    setAdding(practiceKey)

    const { error } = await supabase.from('sessions_planned').insert({
      user_id:      userId,
      session_type: 'mindfulness',
      practice_type: practiceKey,
      title:        practice.name,
      duration_mins: practice.duration_mins,
      purpose_note: practice.brief_description,
      date:         dateStr,
      status:       'planned',
      exercises_json: [],
    })

    setAdding(null)

    if (!error) {
      setConfirmed(prev => ({ ...prev, [practiceKey]: dayLabel }))
      setTimeout(() => {
        setConfirmed(prev => {
          const next = { ...prev }
          delete next[practiceKey]
          return next
        })
      }, 3000)
    } else {
      console.error('[MindfulnessHub] insert error:', error)
    }
  }

  const practices = Object.entries(MINDFULNESS_PRACTICES)

  return (
    <main className="max-w-4xl mx-auto px-4 py-8 pb-16">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-800">Mindfulness</h1>
        <p className="text-sm text-gray-500 mt-1">
          Schedule your weekly Fitz check-in and explore six mindfulness practices.
        </p>
      </div>

      {/* Practice cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {practices.map(([key, practice]) => {
          const isOpen    = openPicker === key
          const isAdding  = adding === key
          const successDay = confirmed[key]

          if (key === 'weekly_review') {
            return (
              <div
                key={key}
                className="bg-teal-600 rounded-2xl shadow-sm overflow-hidden sm:col-span-2"
              >
                <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-teal-500 flex items-center justify-center text-white text-xl font-bold shrink-0">
                      F
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-white leading-tight">
                        Weekly check-in with Fitz
                      </h2>
                      <p className="text-teal-200 text-sm mt-0.5">
                        {practice.duration_mins} min · Coaching conversation
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <button
                      onClick={() => navigate('/chat/fitz', {
                        state: { mode: 'weekly_review' }
                      })}
                      className="bg-white text-teal-700 font-semibold text-sm px-5 py-2.5 rounded-xl hover:bg-teal-50 transition-colors whitespace-nowrap"
                    >
                      Start check-in now →
                    </button>
                    {confirmed[key] ? (
                      <p className="text-teal-200 text-xs font-medium">
                        ✓ Added to {confirmed[key]}
                      </p>
                    ) : (
                      <button
                        onClick={() => setOpenPicker(isOpen ? null : key)}
                        disabled={adding === key}
                        className="text-teal-200 text-xs hover:text-white transition-colors disabled:opacity-40"
                      >
                        {adding === key
                          ? 'Adding…'
                          : openPicker === key
                          ? 'Choose a day above ↑'
                          : '+ Schedule in planner'}
                      </button>
                    )}
                    {openPicker === key && !confirmed[key] && (
                      <div className="mt-1">
                        <p className="text-xs text-teal-200 mb-1.5">Pick a day this week:</p>
                        <div className="grid grid-cols-7 gap-1">
                          {weekDates.map((date, i) => (
                            <button
                              key={date}
                              onClick={() => handleSelectDay(key, date, DAY_LABELS[i])}
                              className="flex flex-col items-center py-1.5 rounded-lg bg-teal-500 border border-teal-400 hover:bg-teal-400 transition-colors"
                            >
                              <span className="text-xs font-semibold text-white">{DAY_LABELS[i]}</span>
                              <span className="text-xs text-teal-200">
                                {new Date(date + 'T00:00:00').getDate()}
                              </span>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => setOpenPicker(null)}
                          className="mt-1.5 text-xs text-teal-300 hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="px-6 pb-5">
                  <p className="text-teal-100 text-sm leading-relaxed">
                    {practice.brief_description}
                  </p>
                </div>
              </div>
            )
          }

          return (
            <div
              key={key}
              className="bg-white rounded-2xl border border-teal-100 shadow-sm overflow-hidden"
            >
              {/* Card header */}
              <div className="bg-teal-50 px-5 py-4 border-b border-teal-100">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <h2 className="text-base font-bold text-teal-900">{practice.name}</h2>
                  <span className="text-xs font-semibold bg-teal-200 text-teal-800 px-2.5 py-0.5 rounded-full shrink-0">
                    {practice.duration_mins} min
                  </span>
                </div>
                {/* best_for tags */}
                <div className="flex flex-wrap gap-1 mt-2">
                  {practice.best_for.map(tag => (
                    <span
                      key={tag}
                      className="text-xs bg-white border border-teal-200 text-teal-600 px-2 py-0.5 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Card body */}
              <div className="px-5 py-4">
                <p className="text-sm text-gray-600 leading-relaxed mb-4">
                  {practice.brief_description}
                </p>

                {/* Success message */}
                {successDay && (
                  <p className="text-sm text-teal-600 font-medium mb-3">
                    ✓ Added to {successDay}
                  </p>
                )}

                {/* Day picker */}
                {isOpen && !successDay && (
                  <div className="mb-3">
                    <p className="text-xs text-gray-500 mb-2 font-medium">Pick a day this week:</p>
                    <div className="grid grid-cols-7 gap-1">
                      {weekDates.map((date, i) => (
                        <button
                          key={date}
                          onClick={() => handleSelectDay(key, date, DAY_LABELS[i])}
                          className="flex flex-col items-center py-1.5 rounded-lg bg-teal-50 border border-teal-200 hover:bg-teal-100 transition-colors"
                        >
                          <span className="text-xs font-semibold text-teal-700">{DAY_LABELS[i]}</span>
                          <span className="text-xs text-teal-500">
                            {new Date(date + 'T00:00:00').getDate()}
                          </span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setOpenPicker(null)}
                      className="mt-2 text-xs text-gray-400 hover:text-gray-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Add to plan button */}
                {!successDay && (
                  <button
                    onClick={() => setOpenPicker(isOpen ? null : key)}
                    disabled={isAdding}
                    className="w-full border border-teal-400 text-teal-600 text-sm font-medium py-2 rounded-xl hover:bg-teal-50 active:bg-teal-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isAdding ? 'Adding…' : isOpen ? 'Choose a day above ↑' : 'Add to plan →'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </main>
  )
}
