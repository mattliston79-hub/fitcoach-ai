import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'
import ProtectedRoute from './components/ProtectedRoute'
import PublicRoute from './components/PublicRoute'
import Navbar from './components/Navbar'
import Dashboard from './pages/Dashboard'
import Onboarding from './pages/Onboarding'
import FitzChat from './pages/FitzChat'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

const Spinner = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

/**
 * Smart redirect from / — sends authenticated users to /onboarding or /dashboard
 * depending on whether they have completed onboarding.
 */
function HomeRedirect() {
  const { session, loading } = useAuth()
  const [checking, setChecking] = useState(true)
  const [onboardingComplete, setOnboardingComplete] = useState(false)

  useEffect(() => {
    if (loading) return
    if (!session) { setChecking(false); return }

    supabase
      .from('users')
      .select('onboarding_complete')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        setOnboardingComplete(data?.onboarding_complete ?? false)
        setChecking(false)
      })
  }, [session, loading])

  if (loading || checking) return <Spinner />
  if (!session) return <Navigate to="/login" replace />
  return <Navigate to={onboardingComplete ? '/dashboard' : '/onboarding'} replace />
}

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
      {/* Smart home redirect */}
      <Route path="/" element={<HomeRedirect />} />

      {/* Public-only routes — authenticated users are sent to / */}
      <Route path="/login"           element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register"        element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />

      {/* Password-recovery route — accessible only after clicking the reset email link */}
      <Route path="/reset-password"  element={<ResetPassword />} />

      {/* Onboarding — no Navbar, full-screen Fitz chat */}
      <Route path="/onboarding" element={
        <ProtectedRoute>
          <Onboarding />
        </ProtectedRoute>
      } />

      {/* Main app — shown after onboarding is complete */}
      <Route path="/dashboard" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-gray-50">
            <Navbar />
            <Dashboard />
          </div>
        </ProtectedRoute>
      } />

      {/* Fitz chat — full-height, Navbar + crisis banner + chat */}
      <Route path="/chat/fitz" element={
        <ProtectedRoute>
          <div className="h-dvh flex flex-col bg-gray-50">
            <Navbar />
            <FitzChat />
          </div>
        </ProtectedRoute>
      } />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
