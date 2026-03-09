import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { askFitz } from '../coach/claudeApi'

const stats = [
  { label: 'Workouts This Week', value: '4' },
  { label: 'Calories Burned', value: '2,340' },
  { label: 'Active Minutes', value: '185' },
  { label: 'Current Streak', value: '7 days' },
]

export default function Dashboard() {
  const { session } = useAuth()
  const [fitzReply, setFitzReply] = useState('')
  const [fitzLoading, setFitzLoading] = useState(false)
  const [fitzError, setFitzError] = useState('')

  const handleTestFitz = async () => {
    setFitzLoading(true)
    setFitzReply('')
    setFitzError('')
    try {
      const reply = await askFitz(session.user.id, [
        { role: 'user', content: 'Hello, who are you?' },
      ])
      setFitzReply(reply)
    } catch (err) {
      setFitzError(err.message)
    } finally {
      setFitzLoading(false)
    }
  }

  return (
    <main className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Welcome back!</h1>
      <p className="text-gray-500 mb-8">Here's your fitness summary for this week.</p>

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-2xl shadow p-5 flex flex-col gap-1">
            <span className="text-2xl font-bold text-indigo-600">{stat.value}</span>
            <span className="text-sm text-gray-500">{stat.label}</span>
          </div>
        ))}
      </div>

      {/* AI Coach card */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-indigo-800">AI Coach Recommendation</h2>
        <p className="text-gray-600 text-sm">
          Based on your recent activity, try a 30-minute upper-body session today. You've been
          consistent with cardio — it's a great time to add some strength training!
        </p>
        <button className="self-start bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          Start Workout
        </button>
      </div>

      {/* ── TEMPORARY TEST: Fitz end-to-end ── */}
      <div className="mt-8 bg-yellow-50 border border-yellow-200 rounded-2xl p-6 flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-yellow-800">⚠ Dev Test — Fitz API</h2>
        <p className="text-yellow-700 text-sm">Sends "Hello, who are you?" to Fitz and displays the raw reply.</p>
        <button
          onClick={handleTestFitz}
          disabled={fitzLoading}
          className="self-start bg-yellow-500 hover:bg-yellow-600 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          {fitzLoading ? 'Waiting for Fitz…' : 'Test Fitz'}
        </button>
        {fitzError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 whitespace-pre-wrap">
            Error: {fitzError}
          </p>
        )}
        {fitzReply && (
          <p className="text-sm text-gray-700 bg-white border border-yellow-200 rounded-lg px-4 py-3 whitespace-pre-wrap">
            {fitzReply}
          </p>
        )}
      </div>
    </main>
  )
}
