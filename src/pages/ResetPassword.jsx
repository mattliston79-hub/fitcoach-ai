import { useState } from 'react'
import { supabase } from '../lib/supabase'

// Shown when Supabase fires a PASSWORD_RECOVERY auth event,
// meaning the user arrived via the reset link in their email.
export default function ResetPassword() {
  const [form, setForm] = useState({ password: '', confirmPassword: '' })
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleChange = e =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))

  const handleSubmit = async e => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)

    const { error: updateError } = await supabase.auth.updateUser({
      password: form.password,
    })

    if (updateError) {
      setError(updateError.message)
      setLoading(false)
      return
    }

    setDone(true)
    setLoading(false)

    // Sign out so the user returns to the login screen cleanly.
    await supabase.auth.signOut()
  }

  if (done) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Password updated</h2>
          <p className="text-gray-500 text-sm">
            Your password has been changed. You can now log in with your new password.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">

        <div className="mb-8 text-center">
          <span className="text-3xl font-bold text-indigo-600 tracking-tight">FitCoach AI</span>
          <p className="mt-2 text-gray-500 text-sm">Create a new password</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
            <input
              name="password"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={form.password}
              onChange={handleChange}
              placeholder="At least 8 characters"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
            <input
              name="confirmPassword"
              type="password"
              required
              autoComplete="new-password"
              minLength={8}
              value={form.confirmPassword}
              onChange={handleChange}
              placeholder="Repeat your new password"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-1"
          >
            {loading ? 'Updating…' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  )
}
