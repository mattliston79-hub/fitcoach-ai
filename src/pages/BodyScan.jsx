import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { calculateOakTreeState } from '../utils/oakTreeState'

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(secs) {
  if (!isFinite(secs)) return '0:00'
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ── Toggle row ────────────────────────────────────────────────────────────────
function ToggleRow({ label, subtitle, checked, onChange, disabled, note }) {
  return (
    <div className={`flex items-center justify-between py-3 ${disabled ? 'opacity-50' : ''}`}>
      <div>
        <p className={`text-sm font-medium ${disabled ? 'text-gray-400' : 'text-slate-700'}`}>{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        {disabled && note && <p className="text-xs text-amber-500 mt-0.5">{note}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked && !disabled ? 'bg-teal-500' : 'bg-gray-200'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked && !disabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  )
}

// ── Waveform (decorative) ─────────────────────────────────────────────────────
const BARS = [3, 5, 8, 6, 9, 7, 10, 8, 6, 9, 7, 5, 8, 6, 4, 7, 9, 6, 8, 5,
              3, 6, 9, 7, 5, 8, 10, 7, 6, 9, 5, 7, 8, 6, 4, 7, 9, 6, 8, 5]

function Waveform({ progress }) {
  const cutoff = Math.floor(progress * BARS.length)
  return (
    <div className="flex items-center justify-center gap-0.5 h-10 px-2">
      {BARS.map((h, i) => (
        <div
          key={i}
          style={{ height: `${h * 3}px` }}
          className={`w-1 rounded-full transition-colors ${
            i < cutoff ? 'bg-teal-500' : 'bg-gray-200'
          }`}
        />
      ))}
    </div>
  )
}

// ── Audio Player ──────────────────────────────────────────────────────────────
function AudioPlayer({ src, onTimeUpdate }) {
  const audioRef   = useRef(null)
  const [playing,  setPlaying]  = useState(false)
  const [current,  setCurrent]  = useState(0)
  const [duration, setDuration] = useState(0)
  const progress = duration > 0 ? current / duration : 0

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    el.src = src
    el.load()
    setPlaying(false)
    setCurrent(0)
    setDuration(0)
  }, [src])

  const togglePlay = () => {
    const el = audioRef.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false) }
    else { el.play(); setPlaying(true) }
  }

  const skip = (secs) => {
    const el = audioRef.current
    if (!el) return
    el.currentTime = Math.max(0, Math.min(el.duration || 0, el.currentTime + secs))
  }

  const seek = (e) => {
    const el = audioRef.current
    if (!el || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    el.currentTime = ratio * duration
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          const t = audioRef.current?.currentTime ?? 0
          setCurrent(t)
          onTimeUpdate(t)
        }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
      />

      {/* Waveform */}
      <Waveform progress={progress} />

      {/* Progress bar */}
      <div
        onClick={seek}
        className="w-full h-2 bg-gray-100 rounded-full cursor-pointer mt-3 mb-2"
      >
        <div
          className="h-full bg-teal-500 rounded-full transition-all"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Time */}
      <div className="flex justify-between text-xs text-gray-400 mb-4">
        <span>{fmt(current)}</span>
        <span>{fmt(duration)}</span>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-6">
        <button
          onClick={() => skip(-15)}
          className="flex flex-col items-center gap-1 text-gray-500 hover:text-teal-600 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 .49-3.86" />
          </svg>
          <span className="text-xs">15s</span>
        </button>

        <button
          onClick={togglePlay}
          className="w-14 h-14 rounded-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white flex items-center justify-center transition-colors shadow-sm"
        >
          {playing ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
        </button>

        <button
          onClick={() => skip(15)}
          className="flex flex-col items-center gap-1 text-gray-500 hover:text-teal-600 transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-.49-3.86" />
          </svg>
          <span className="text-xs">15s</span>
        </button>
      </div>
    </div>
  )
}

// ── Script reader ─────────────────────────────────────────────────────────────
function ScriptReader({ text, onComplete }) {
  const paragraphs = (text || '').split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  const [index, setIndex] = useState(0)
  const done = index >= paragraphs.length - 1

  const advance = () => {
    if (done) return
    const next = index + 1
    setIndex(next)
    if (next >= paragraphs.length - 1) onComplete()
  }

  if (!paragraphs.length) return null

  return (
    <div
      onClick={advance}
      className={`bg-white rounded-2xl border border-gray-100 shadow-sm p-6 text-center select-none ${!done ? 'cursor-pointer' : ''}`}
    >
      <p className="text-xs text-gray-400 mb-4 uppercase tracking-wide">
        Section {index + 1} of {paragraphs.length}
      </p>
      <p className="text-base text-slate-700 leading-relaxed whitespace-pre-wrap">
        {paragraphs[index]}
      </p>
      <p className="text-xs text-gray-400 mt-5">
        {done ? '✓ Practice complete' : 'Tap to continue'}
      </p>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
const LS_AUDIO = 'bodyscan_audio_on'
const LS_TEXT  = 'bodyscan_text_on'

export default function BodyScan() {
  const { session } = useAuth()
  const navigate    = useNavigate()
  const userId      = session.user.id

  const [scripts,        setScripts]        = useState([])
  const [selectedScript, setSelectedScript] = useState(null)
  const [loadingScripts, setLoadingScripts] = useState(true)
  const [audioUrl,       setAudioUrl]       = useState(null)
  const [loadingAudio,   setLoadingAudio]   = useState(false)

  // Persist toggles in localStorage
  const [audioOn, setAudioOn] = useState(() => {
    const v = localStorage.getItem(LS_AUDIO)
    return v === null ? true : v === 'true'
  })
  const [textOn, setTextOn] = useState(() => {
    const v = localStorage.getItem(LS_TEXT)
    return v === null ? true : v === 'true'
  })

  // Logging state
  const [audioTime,    setAudioTime]    = useState(0)   // seconds played
  const [textComplete, setTextComplete] = useState(false)
  const [saving,       setSaving]       = useState(false)
  const [saved,        setSaved]        = useState(false)
  const [saveError,    setSaveError]    = useState('')

  // Fetch scripts on mount
  useEffect(() => {
    supabase
      .from('mindfulness_scripts')
      .select('id, slug, title, subtitle, approach, duration_mins_min, duration_mins_max, focus, script_text, audio_uploaded, display_order')
      .eq('active', true)
      .order('display_order')
      .then(({ data }) => {
        const list = data ?? []
        setScripts(list)
        if (list.length) setSelectedScript(list[0])
        setLoadingScripts(false)
      })
  }, [])

  // Fetch signed audio URL whenever script or audioOn changes
  useEffect(() => {
    if (!selectedScript?.audio_uploaded || !audioOn) {
      setAudioUrl(null)
      return
    }
    setLoadingAudio(true)
    supabase.storage
      .from('mindfulness-audio')
      .createSignedUrl(selectedScript.slug + '.mp3', 3600)
      .then(({ data }) => {
        setAudioUrl(data?.signedUrl ?? null)
        setLoadingAudio(false)
      })
  }, [selectedScript, audioOn])

  // Reset text complete when script changes
  useEffect(() => {
    setTextComplete(false)
    setAudioTime(0)
  }, [selectedScript])

  const handleToggleAudio = useCallback((val) => {
    setAudioOn(val)
    localStorage.setItem(LS_AUDIO, String(val))
  }, [])

  const handleToggleText = useCallback((val) => {
    setTextOn(val)
    localStorage.setItem(LS_TEXT, String(val))
  }, [])

  const canLog = audioTime >= 300 || textComplete  // 5 minutes or text done

  const handleLog = async () => {
    if (!canLog || saving || saved) return
    setSaving(true)
    setSaveError('')
    try {
      const today = new Date().toISOString().slice(0, 10)
      const estimatedDuration = selectedScript.duration_mins_min ?? 10
      const { error } = await supabase.from('mindfulness_logs').insert({
        user_id:     userId,
        script_id:   selectedScript.id,
        script_slug: selectedScript.slug,
        date:        today,
        duration_mins: Math.round(audioTime / 60) || estimatedDuration,
        audio_used:  audioOn && !!selectedScript.audio_uploaded,
        text_used:   textOn,
        completed:   true,
      })
      if (error) throw error
      calculateOakTreeState(userId)
      setSaved(true)
      setTimeout(() => navigate('/dashboard'), 1500)
    } catch (err) {
      setSaveError(err.message || 'Something went wrong — please try again')
      setSaving(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loadingScripts) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!scripts.length) {
    return (
      <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center px-6">
        <p className="text-sm text-gray-400 text-center">
          Body scan scripts are not available right now. Please try again later.
        </p>
      </div>
    )
  }

  const showAudioPlayer = audioOn && !!selectedScript?.audio_uploaded
  const audioAvailable  = !!selectedScript?.audio_uploaded

  return (
    <div className="min-h-screen bg-[#FAFAF7] pb-12">
      <div className="max-w-md mx-auto px-4 pt-6 space-y-4">

        {/* ── Header ── */}
        <div className="mb-2">
          <h1 className="text-xl font-bold text-slate-800">Body Scan</h1>
          {selectedScript && (
            <p className="text-sm text-gray-400 mt-0.5">{selectedScript.title}</p>
          )}
        </div>

        {/* ── Script picker (hidden if only one script) ── */}
        {scripts.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
            {scripts.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedScript(s)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedScript?.id === s.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-white border border-gray-200 text-slate-600 hover:border-teal-300'
                }`}
              >
                {s.approach}
              </button>
            ))}
          </div>
        )}

        {/* ── Selected script meta ── */}
        {selectedScript && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <p className="text-sm font-semibold text-slate-700">{selectedScript.title}</p>
            {selectedScript.subtitle && (
              <p className="text-xs text-gray-400 mt-0.5">{selectedScript.subtitle}</p>
            )}
            <div className="flex gap-3 mt-2 flex-wrap">
              {selectedScript.duration_mins_min && (
                <span className="text-xs text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
                  {selectedScript.duration_mins_min}–{selectedScript.duration_mins_max} min
                </span>
              )}
              {selectedScript.focus && (
                <span className="text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full capitalize">
                  {selectedScript.focus}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Mode toggles ── */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-5 divide-y divide-gray-100">
          <ToggleRow
            label="Audio guide"
            subtitle={audioOn && audioAvailable ? 'Guided audio playing' : 'Audio off'}
            checked={audioOn}
            onChange={handleToggleAudio}
            disabled={!audioAvailable}
            note={!audioAvailable ? 'Audio coming soon' : ''}
          />
          <ToggleRow
            label="Script text"
            subtitle={textOn ? 'Follow along on screen' : 'Eyes-closed mode'}
            checked={textOn}
            onChange={handleToggleText}
          />
        </div>

        {/* ── Audio player ── */}
        {showAudioPlayer && (
          loadingAudio ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 flex justify-center">
              <div className="w-6 h-6 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : audioUrl ? (
            <AudioPlayer src={audioUrl} onTimeUpdate={setAudioTime} />
          ) : (
            <p className="text-xs text-red-500 text-center">Could not load audio. Please try again.</p>
          )
        )}

        {/* ── Script text reader ── */}
        {textOn && selectedScript?.script_text && (
          <ScriptReader
            text={selectedScript.script_text}
            onComplete={() => setTextComplete(true)}
          />
        )}

        {/* ── Error ── */}
        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            {saveError}
          </p>
        )}

        {/* ── Log button ── */}
        <button
          onClick={handleLog}
          disabled={!canLog || saving || saved}
          className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-4 rounded-2xl text-sm transition-colors shadow-sm"
        >
          {saved
            ? '🌱 Practice logged. Your tree has been nourished.'
            : saving
              ? 'Saving…'
              : canLog
                ? 'Log this practice'
                : 'Complete to log practice'}
        </button>

      </div>
    </div>
  )
}
