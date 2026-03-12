import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const Spinner = () => (
  <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
  </div>
)

// Renders children when unauthenticated; redirects to / otherwise.
// Prevents logged-in users from seeing the login/register pages.
export default function PublicRoute({ children }) {
  const { session, loading } = useAuth()
  if (loading) return <Spinner />
  if (session) return <Navigate to="/" replace />
  return children
}
