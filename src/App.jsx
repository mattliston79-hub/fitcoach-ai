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
import RexChat from './pages/RexChat'
import SessionPlanner from './pages/SessionPlanner'
import ExerciseLibrary from './pages/ExerciseLibrary'
import SessionLogger from './pages/SessionLogger'
import HIITLogger from './pages/HIITLogger'
import YogaLogger from './pages/YogaLogger'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

const Spinner = () => (
  <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
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
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <Dashboard />
          </div>
        </ProtectedRoute>
      } />

      {/* Fitz chat — full-height, Navbar + crisis banner + chat */}
      <Route path="/chat/fitz" element={
        <ProtectedRoute>
          <div className="h-dvh flex flex-col bg-[#FAFAF7]">
            <Navbar />
            <FitzChat />
          </div>
        </ProtectedRoute>
      } />

      {/* Session planner */}
      <Route path="/planner" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <SessionPlanner />
          </div>
        </ProtectedRoute>
      } />

      {/* Rex chat — full-height, Navbar + chat */}
      <Route path="/chat/rex" element={
        <ProtectedRoute>
          <div className="h-dvh flex flex-col bg-[#FAFAF7]">
            <Navbar />
            <RexChat />
          </div>
        </ProtectedRoute>
      } />

      {/* Exercise library */}
      <Route path="/exercises" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <ExerciseLibrary />
          </div>
        </ProtectedRoute>
      } />

      {/* Session logger — strength (full-screen, no Navbar) */}
      <Route path="/session/:sessionId" element={
        <ProtectedRoute>
          <SessionLogger />
        </ProtectedRoute>
      } />

      {/* HIIT / cardio logger — full-screen, no Navbar */}
      <Route path="/hiit/:sessionId" element={
        <ProtectedRoute>
          <HIITLogger />
        </ProtectedRoute>
      } />

      {/* Yoga / pilates / flexibility logger — full-screen, no Navbar */}
      <Route path="/yoga/:sessionId" element={
        <ProtectedRoute>
          <YogaLogger />
        </ProtectedRoute>
      } />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
