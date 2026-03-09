import { useEffect } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

export default function App() {
  const { authEvent } = useAuth()
  const navigate = useNavigate()

  // Redirect to /reset-password when the user lands via a password-reset email link.
  useEffect(() => {
    if (authEvent === 'PASSWORD_RECOVERY') {
      navigate('/reset-password', { replace: true })
    }
  }, [authEvent, navigate])

  return (
    <Routes>
      {/* Public-only routes — authenticated users are sent to / */}
      <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register"        element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />

      {/* Password-recovery route — accessible only after clicking the reset email link */}
      <Route path="/reset-password"  element={<ResetPassword />} />

      {/* Protected routes — unauthenticated users are sent to /login */}
      <Route path="/" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <Dashboard />
          </div>
        </ProtectedRoute>
      } />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
