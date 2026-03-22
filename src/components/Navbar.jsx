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
        <NavLink to="/activity"   className={linkClass}>Activity</NavLink>
        <NavLink to="/progress"   className={linkClass}>Progress</NavLink>
        <NavLink to="/planner"    className={linkClass}>Plan</NavLink>
        <NavLink to="/wellbeing"  className={linkClass}>Wellbeing</NavLink>
        <NavLink to="/bodyscan"   className={linkClass}>Body Scan</NavLink>
        <NavLink to="/exercises"  className={linkClass}>Library</NavLink>
        <NavLink to="/chat/fitz" className={linkClass}>Fitz</NavLink>
        <NavLink to="/chat/rex"  className={linkClass}>Rex</NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `transition-colors ${isActive ? 'text-white' : 'text-teal-100 hover:text-white'}`
          }
          aria-label="Profile"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </NavLink>
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
