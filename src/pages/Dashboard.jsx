const stats = [
  { label: 'Workouts This Week', value: '4' },
  { label: 'Calories Burned', value: '2,340' },
  { label: 'Active Minutes', value: '185' },
  { label: 'Current Streak', value: '7 days' },
]

export default function Dashboard() {
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
    </main>
  )
}
