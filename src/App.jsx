import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'

export default function App() {
  const { session, loading } = useAuth()
  const [page, setPage] = useState('login') // 'login' | 'register'

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!session) {
    return page === 'register'
      ? <Register onSwitchToLogin={() => setPage('login')} />
      : <Login onSwitchToRegister={() => setPage('register')} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Dashboard />
    </div>
  )
}
