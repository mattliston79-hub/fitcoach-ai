import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

export default function App() {
  const { session, loading, authEvent } = useAuth()
  const [page, setPage] = useState('login') // 'login' | 'register' | 'forgot-password'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // User arrived via the reset-password email link — show the new password form.
  if (authEvent === 'PASSWORD_RECOVERY') {
    return <ResetPassword />
  }

  if (!session) {
    if (page === 'register') return <Register onSwitchToLogin={() => setPage('login')} />
    if (page === 'forgot-password') return <ForgotPassword onBack={() => setPage('login')} />
    return (
      <Login
        onSwitchToRegister={() => setPage('register')}
        onForgotPassword={() => setPage('forgot-password')}
      />
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Dashboard />
    </div>
  )
}
