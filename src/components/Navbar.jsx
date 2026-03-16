import { NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Navbar() {
  const handleLogout = async () => {
    await supabase.auth.signOut()
    // AuthContext picks up the session change → ProtectedRoute redirects to /login
  }

  const linkClass = ({ isActive }) =>
    `transition-colors text-sm font-medium ${
      isActive ? 'text-white' : 'text-teal-100 hover:text-white'
    }`

  return (
    <nav className="bg-teal-600 text-white px-6 py-4 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-2">
        <span className="text-2xl font-bold tracking-tight">Alongside</span>
      </div>
      <div className="flex items-center gap-6 text-sm font-medium">
        <NavLink to="/dashboard"  className={linkClass}>Dashboard</NavLink>
        <NavLink to="/goals"      className={linkClass}>Goals</NavLink>
        <NavLink to="/planner"    className={linkClass}>Plan</NavLink>
        <NavLink to="/wellbeing"  className={linkClass}>Wellbeing</NavLink>
        <NavLink to="/bodyscan"   className={linkClass}>Body Scan</NavLink>
        <NavLink to="/exercises"  className={linkClass}>Library</NavLink>
        <NavLink to="/chat/fitz" className={linkClass}>Fitz</NavLink>
        <NavLink to="/chat/rex"  className={linkClass}>Rex</NavLink>
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
