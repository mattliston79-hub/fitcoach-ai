import { supabase } from '../lib/supabase'

export default function Navbar() {
  const handleLogout = async () => {
    await supabase.auth.signOut()
    // AuthContext picks up the session change → ProtectedRoute redirects to /login
  }

  return (
    <nav className="bg-indigo-600 text-white px-6 py-4 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tracking-tight">FitCoach AI</span>
      </div>
      <div className="flex items-center gap-6 text-sm font-medium">
        <a href="#" className="hover:text-indigo-200 transition-colors">Dashboard</a>
        <a href="#" className="hover:text-indigo-200 transition-colors">Workouts</a>
        <a href="#" className="hover:text-indigo-200 transition-colors">Nutrition</a>
        <a href="#" className="hover:text-indigo-200 transition-colors">Progress</a>
        <button
          onClick={handleLogout}
          className="ml-2 bg-white/15 hover:bg-white/25 transition-colors px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          Log out
        </button>
      </div>
    </nav>
  )
}
