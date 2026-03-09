import { useState, useEffect } from 'react'

// Best-effort country code from navigator.language (e.g. "en-GB" → "GB").
function fromLocale() {
  const parts = (navigator.language ?? '').split('-')
  if (parts.length > 1) return parts[parts.length - 1].toUpperCase()
  return ''
}

/**
 * Detects the user's country code.
 * 1. Immediately seeds state from navigator.language as a fast fallback.
 * 2. Fires a lightweight IP geolocation call; updates state if it resolves.
 * Returns { countryCode, setCountryCode, detecting }.
 */
export function useCountryCode() {
  const [countryCode, setCountryCode] = useState(fromLocale)
  const [detecting, setDetecting] = useState(true)

  useEffect(() => {
    let cancelled = false

    fetch('https://ipapi.co/country/', { signal: AbortSignal.timeout(4000) })
      .then(res => res.text())
      .then(code => {
        const trimmed = code.trim()
        if (!cancelled && /^[A-Z]{2}$/.test(trimmed)) {
          setCountryCode(trimmed)
        }
      })
      .catch(() => {
        // Network error or timeout — locale fallback already in state.
      })
      .finally(() => {
        if (!cancelled) setDetecting(false)
      })

    return () => { cancelled = true }
  }, [])

  return { countryCode, setCountryCode, detecting }
}
