import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCountryCode } from '../hooks/useCountryCode'
import { COUNTRIES } from '../lib/countries'

const CONFIDENCE_OPTIONS = [
  { value: 'very_low',  label: "Not at all confident — I haven't exercised in a long time" },
  { value: 'low',       label: "A little nervous — I know what I want but not sure where to start" },
  { value: 'moderate',  label: 'Fairly confident — I exercise occasionally and want to do more' },
  { value: 'high',      label: 'Confident — I exercise regularly and want structured support' },
]

const GENDER_OPTIONS = [
  { value: 'female',          label: 'Female' },
  { value: 'male',            label: 'Male' },
  { value: 'non_binary',      label: 'Non-binary' },
  { value: 'prefer_not_say',  label: 'Prefer not to say' },
]

export default function Register() {
  const { countryCode, setCountryCode, detecting } = useCountryCode()

  const [step, setStep] = useState(1)
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    age: '',
    gender: '',
    activityConfidence: '',
  })
  const [checks, setChecks] = useState({
    medicallyFit:  false,
    notTherapy:    false,
    notPhysio:     false,
    understandsAI: false,
  })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleChange = e => setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  const handleCheck  = e => setChecks(prev => ({ ...prev, [e.target.name]: e.target.checked }))

  // Step 1 validation
  const handleStep1 = e => {
    e.preventDefault()
    setError('')
    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (form.password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setStep(2)
  }

  // Step 2 final submit
  const handleSubmit = async e => {
    e.preventDefault()
    setError('')

    if (!form.age || isNaN(Number(form.age)) || Number(form.age) < 16 || Number(form.age) > 100) {
      setError('Please enter a valid age (16–100).')
      return
    }
    if (!form.gender) {
      setError('Please select a gender option.')
      return
    }
    if (!form.activityConfidence) {
      setError('Please tell us how confident you feel about exercise.')
      return
    }
    if (!checks.medicallyFit || !checks.notTherapy || !checks.notPhysio || !checks.understandsAI) {
      setError('Please read and confirm all four declarations before continuing.')
      return
    }

    setLoading(true)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          name: form.name,
          country_code: countryCode || null,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Save extended profile data if we have a user id (email-confirmed flow gives us one)
    const uid = data.user?.id
    if (uid) {
      await supabase.from('user_profiles').upsert({
        user_id:             uid,
        age:                 Number(form.age),
        gender:              form.gender,
        activity_confidence: form.activityConfidence,
        country_code:        countryCode || null,
      })
    }

    if (!data.session) {
      setSuccess(true)
    }

    setLoading(false)
  }

  // ── Success screen ───────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md text-center">
          <div className="text-4xl mb-4">📬</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Check your email</h2>
          <p className="text-gray-500 text-sm">
            We sent a confirmation link to <strong>{form.email}</strong>. Click it to activate your account.
          </p>
          <Link to="/login" className="mt-6 inline-block text-teal-600 text-sm font-medium hover:underline">
            Back to log in
          </Link>
        </div>
      </div>
    )
  }

  // ── Shared outer wrapper ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-4 py-8">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">

        {/* Header */}
        <div className="mb-6 text-center">
          <span className="text-3xl font-bold text-teal-600 tracking-tight">Alongside</span>
          <p className="mt-1 text-xs font-medium text-teal-500 tracking-wide">Not a plan. A conversation.</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className={`h-1.5 rounded-full transition-all ${step === 1 ? 'w-8 bg-teal-600' : 'w-4 bg-teal-200'}`} />
            <div className={`h-1.5 rounded-full transition-all ${step === 2 ? 'w-8 bg-teal-600' : 'w-4 bg-teal-200'}`} />
          </div>
          <p className="mt-3 text-gray-500 text-sm">
            {step === 1 ? 'Create your account (1 of 2)' : 'About you (2 of 2)'}
          </p>
        </div>

        {/* ── STEP 1 ─────────────────────────────────────────────────────── */}
        {step === 1 && (
          <form onSubmit={handleStep1} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
              <input
                name="name" type="text" required autoComplete="name"
                value={form.name} onChange={handleChange} placeholder="Jane Smith"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                name="email" type="email" required autoComplete="email"
                value={form.email} onChange={handleChange} placeholder="jane@example.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                name="password" type="password" required autoComplete="new-password" minLength={8}
                value={form.password} onChange={handleChange} placeholder="At least 8 characters"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input
                name="confirmPassword" type="password" required autoComplete="new-password" minLength={8}
                value={form.confirmPassword} onChange={handleChange} placeholder="Repeat your password"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Country
                {detecting && <span className="ml-2 text-xs text-gray-400 font-normal">detecting…</span>}
                {!detecting && countryCode && <span className="ml-2 text-xs text-gray-400 font-normal">auto-detected</span>}
              </label>
              <select
                value={countryCode} onChange={e => setCountryCode(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">Select your country</option>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <button
              type="submit"
              className="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-1"
            >
              Continue →
            </button>
          </form>
        )}

        {/* ── STEP 2 ─────────────────────────────────────────────────────── */}
        {step === 2 && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            {/* Age */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Age</label>
              <input
                name="age" type="number" min="16" max="100" required
                value={form.age} onChange={handleChange} placeholder="e.g. 35"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Gender</label>
              <div className="grid grid-cols-2 gap-2">
                {GENDER_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer transition-colors ${
                      form.gender === opt.value
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio" name="gender" value={opt.value}
                      checked={form.gender === opt.value}
                      onChange={handleChange}
                      className="accent-teal-600"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Activity confidence */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                How confident do you feel about getting active?
              </label>
              <div className="flex flex-col gap-2">
                {CONFIDENCE_OPTIONS.map(opt => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 border rounded-lg px-3 py-2.5 text-sm cursor-pointer transition-colors ${
                      form.activityConfidence === opt.value
                        ? 'border-teal-500 bg-teal-50 text-teal-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio" name="activityConfidence" value={opt.value}
                      checked={form.activityConfidence === opt.value}
                      onChange={handleChange}
                      className="accent-teal-600 mt-0.5 shrink-0"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* Disclaimer + checkboxes */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">
                Before you continue — please read this
              </p>
              <p className="text-xs text-amber-700 leading-relaxed">
                Alongside is an AI coaching tool. It is not a substitute for medical advice,
                physiotherapy, or mental health treatment. Please read and confirm each of the
                following:
              </p>

              {[
                {
                  name: 'medicallyFit',
                  label: 'I am medically fit to take part in exercise, or I will discuss any concerns with my GP before starting. I understand Alongside is not a medical service.',
                },
                {
                  name: 'notTherapy',
                  label: 'I understand that Fitz is an AI coach and not a therapist or counsellor. If I am experiencing a mental health crisis, I will seek professional help.',
                },
                {
                  name: 'notPhysio',
                  label: 'I understand that Rex is an AI coach and not a physiotherapist. I will not rely on Rex for advice about injuries or medical conditions.',
                },
                {
                  name: 'understandsAI',
                  label: 'I understand that Alongside is powered by AI and may make mistakes. I will use my own judgement and seek professional advice when needed.',
                },
              ].map(item => (
                <label key={item.name} className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    name={item.name}
                    checked={checks[item.name]}
                    onChange={handleCheck}
                    className="accent-teal-600 mt-0.5 shrink-0 w-4 h-4"
                  />
                  <span className="text-xs text-amber-800 leading-relaxed">{item.label}</span>
                </label>
              ))}
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setStep(1); setError('') }}
                className="flex-1 border border-gray-200 text-gray-600 font-medium py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to="/login" className="text-teal-600 font-medium hover:underline">Log in</Link>
        </p>
      </div>
    </div>
  )
}
