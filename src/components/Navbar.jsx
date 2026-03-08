export default function Navbar() {
  return (
    <nav className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tracking-tight">FitCoach AI</span>
      </div>
      <div className="flex gap-6 text-sm font-medium">
        <a href="#" className="hover:text-indigo-200 transition-colors">Dashboard</a>
        <a href="#" className="hover:text-indigo-200 transition-colors">Workouts</a>
        <a href="#" className="hover:text-indigo-200 transition-colors">Nutrition</a>
        <a href="#" className="hover:text-indigo-200 transition-colors">Progress</a>
      </div>
    </nav>
  )
}
