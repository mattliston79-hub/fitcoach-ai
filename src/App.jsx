import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
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
import MindfulnessLogger from './pages/MindfulnessLogger'
import JournalingLogger from './pages/JournalingLogger'
import PostSession from './pages/PostSession'
import WellbeingLog from './pages/WellbeingLog'
import BodyScan from './pages/BodyScan'
import MindfulnessHub from './pages/MindfulnessHub'
import Goals from './pages/Goals'
import ActivityLog from './pages/ActivityLog'
import Progress from './pages/Progress'
import Programme from './pages/Programme'
import Profile from './pages/Profile'
import About from './pages/About'
import Admin from './pages/Admin'
import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'

/**
 * Dispatcher for /logger — reads sessionsPlannedId from navigation state
 * and redirects to the appropriate session logger.
 * Extend this as new logger types are added.
 */
function ProgrammeLoggerDispatch() {
  const { state } = useLocation()
  const id = state?.sessionsPlannedId
  if (!id) return <Navigate to="/programme" replace />
  // Routes to the generic session logger — update to dispatch by session type as loggers evolve
  return <Navigate to={`/session/${id}`} replace />
}

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

      {/* Programme — full training plan view */}
      <Route path="/programme" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-white">
            <Navbar />
            <Programme />
          </div>
        </ProtectedRoute>
      } />

      {/* Logger dispatcher — receives sessionsPlannedId via navigation state
          and routes to the correct session logger */}
      <Route path="/logger" element={
        <ProtectedRoute>
          <ProgrammeLoggerDispatch />
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

      {/* Mindfulness logger — full-screen, no Navbar */}
      <Route path="/mindfulness/:sessionId" element={
        <ProtectedRoute>
          <MindfulnessLogger />
        </ProtectedRoute>
      } />

      {/* Journaling logger — full-screen, no Navbar */}
      <Route path="/journaling/:sessionId" element={
        <ProtectedRoute>
          <JournalingLogger />
        </ProtectedRoute>
      } />

      {/* Post-session summary / badge / Fitz debrief prompt */}
      <Route path="/post-session/:loggedSessionId" element={
        <ProtectedRoute>
          <PostSession />
        </ProtectedRoute>
      } />

      {/* Daily wellbeing check-in */}
      <Route path="/wellbeing" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <WellbeingLog />
          </div>
        </ProtectedRoute>
      } />

      {/* Mindfulness hub — browsable practice library */}
      <Route path="/mindfulness" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <MindfulnessHub />
          </div>
        </ProtectedRoute>
      } />

      {/* Legacy body scan redirect */}
      <Route path="/bodyscan" element={<Navigate to="/mindfulness" replace />} />

      {/* Goals */}
      <Route path="/goals" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <Goals />
          </div>
        </ProtectedRoute>
      } />

      {/* Activity log */}
      <Route path="/activity" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <ActivityLog />
          </div>
        </ProtectedRoute>
      } />

      {/* Progress — history, records, badges, wellbeing */}
      <Route path="/progress" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <Progress />
          </div>
        </ProtectedRoute>
      } />

      {/* Profile */}
      <Route path="/profile" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <Profile />
          </div>
        </ProtectedRoute>
      } />

      {/* About Alongside */}
      <Route path="/about" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <About />
          </div>
        </ProtectedRoute>
      } />

      {/* Admin — redirect non-admins to dashboard */}
      <Route path="/admin" element={
        <ProtectedRoute>
          <div className="min-h-screen bg-[#FAFAF7]">
            <Navbar />
            <Admin />
          </div>
        </ProtectedRoute>
      } />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
