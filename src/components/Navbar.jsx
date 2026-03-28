import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const ADMIN_EMAILS = ['mattliston79@gmail.com']

const TABS = [
  { label: 'Home',      icon: '⌂',  to: '/dashboard' },
  { label: 'Move',      icon: '◎',  to: '/programme' },
  { label: 'Diary',     icon: '📋', to: '/planner'   },
  { label: 'Wellbeing', icon: '♡',  to: '/wellbeing' },
  { label: 'Progress',  icon: '✦',  to: '/progress'  },
]

export default function Navbar() {
  const { session } = useAuth()
  const userEmail = session?.user?.email
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleLogout = async () => {
    setMenuOpen(false)
    await supabase.auth.signOut()
  }

  const initials = userEmail?.[0]?.toUpperCase() ?? 'M'

  return (
    <nav className="bg-teal-600 text-white px-4 py-0 flex items-center justify-between shadow-md h-[52px]">
      {/* Wordmark */}
      <span className="text-xl font-bold tracking-tight select-none">Alongside</span>

      {/* Right side */}
      <div className="flex items-center gap-3">

        {/* Pill tab bar */}
        <div className="flex items-center bg-white/10 rounded-full p-1 gap-0.5">
          {TABS.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex flex-col items-center px-2 py-1 rounded-full text-[11px] font-medium leading-tight transition-colors min-w-[40px] gap-0.5 ` +
                (isActive
                  ? 'bg-white text-teal-700'
                  : 'text-teal-100 hover:text-white hover:bg-white/10')
              }
            >
              <span className="text-[14px] leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </NavLink>
          ))}
        </div>

        {/* Avatar / profile dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(prev => !prev)}
            className="w-8 h-8 rounded-full bg-white/20 border border-white/40 flex items-center justify-center text-xs font-semibold hover:bg-white/30 transition-colors"
            aria-label="Profile menu"
          >
            {initials}
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-10 w-44 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 text-gray-700 text-sm">
              <button
                onClick={() => { setMenuOpen(false); navigate('/about') }}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                About Alongside
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate('/profile') }}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                Profile &amp; settings
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate('/goals') }}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                Goals
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate('/exercises') }}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                Exercise library
              </button>
              <button
                onClick={() => { setMenuOpen(false); navigate('/mindfulness') }}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 transition-colors"
              >
                Mindfulness
              </button>
              <hr className="my-1 border-gray-100" />
              <button
                onClick={handleLogout}
                className="w-full text-left px-4 py-2 text-red-500 hover:bg-red-50 transition-colors"
              >
                Log out
              </button>
              {ADMIN_EMAILS.includes(userEmail) && (
                <button
                  onClick={() => { setMenuOpen(false); navigate('/admin') }}
                  className="w-full text-left px-4 py-2 text-gray-400 hover:bg-gray-50 transition-colors text-xs"
                >
                  Admin
                </button>
              )}
            </div>
          )}
        </div>

      </div>
    </nav>
  )
}
