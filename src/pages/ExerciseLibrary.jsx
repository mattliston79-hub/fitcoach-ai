import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

// ── Category filter config ─────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'all',             label: 'All'          },
  { key: 'kettlebell',      label: 'Kettlebell'   },
  { key: 'gym_strength',    label: 'Strength'     },
  { key: 'hiit_bodyweight', label: 'HIIT'         },
  { key: 'yoga',            label: 'Yoga'         },
  { key: 'pilates',         label: 'Pilates'      },
  { key: 'flexibility',     label: 'Flexibility'  },
  { key: 'plyometrics',     label: 'Plyometrics'  },
  { key: 'coordination',    label: 'Coordination' },
]

const CATEGORY_COLORS = {
  kettlebell:      'bg-amber-100 text-amber-800 border-amber-200',
  gym_strength:    'bg-slate-100 text-slate-700 border-slate-200',
  hiit_bodyweight: 'bg-red-100 text-red-800 border-red-200',
  yoga:            'bg-violet-100 text-violet-800 border-violet-200',
  pilates:         'bg-pink-100 text-pink-800 border-pink-200',
  flexibility:     'bg-emerald-100 text-emerald-800 border-emerald-200',
  plyometrics:     'bg-orange-100 text-orange-800 border-orange-200',
  coordination:    'bg-blue-100 text-blue-800 border-blue-200',
}

const LEVEL_COLORS = {
  novice:       'bg-emerald-50 text-emerald-600',
  intermediate: 'bg-amber-50 text-amber-600',
  advanced:     'bg-red-50 text-red-600',
  all:          'bg-gray-50 text-gray-500',
}

// ── GIF placeholder ────────────────────────────────────────────────────────
function GifPlaceholder({ category }) {
  const emojis = {
    kettlebell: '🏋️', gym_strength: '💪', hiit_bodyweight: '⚡',
    yoga: '🧘', pilates: '🌀', flexibility: '🤸',
    plyometrics: '🦘', coordination: '🎯',
  }
  return (
    <div className="w-full h-full bg-gray-100 flex items-center justify-center">
      <span className="text-3xl opacity-40">{emojis[category] ?? '🏃'}</span>
    </div>
  )
}

// ── Exercise card (list view) ──────────────────────────────────────────────
function ExerciseCard({ exercise, onClick }) {
  const catClass = CATEGORY_COLORS[exercise.category] ?? 'bg-gray-100 text-gray-700 border-gray-200'
  const muscles = exercise.muscles_primary?.slice(0, 2).join(', ') ?? ''

  return (
    <button
      onClick={onClick}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden text-left hover:shadow-md hover:border-gray-200 active:scale-[0.98] transition-all flex flex-col"
    >
      {/* GIF thumbnail */}
      <div className="w-full aspect-[4/3] overflow-hidden bg-gray-50 flex-shrink-0">
        {exercise.gif_url ? (
          <img
            src={exercise.gif_url}
            alt={exercise.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <GifPlaceholder category={exercise.category} />
        )}
      </div>

      {/* Card body */}
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-sm font-semibold text-gray-800 leading-tight capitalize">
          {exercise.name}
        </p>
        {muscles && (
          <p className="text-xs text-gray-400 capitalize">{muscles}</p>
        )}
        <div className="flex items-center gap-1.5 mt-auto pt-1 flex-wrap">
          <span className={`text-xs px-2 py-0.5 rounded-full border capitalize font-medium ${catClass}`}>
            {exercise.category?.replace(/_/g, ' ')}
          </span>
          {exercise.experience_level && exercise.experience_level !== 'all' && (
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${LEVEL_COLORS[exercise.experience_level] ?? 'bg-gray-50 text-gray-500'}`}>
              {exercise.experience_level}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

// ── Detail modal ───────────────────────────────────────────────────────────
function DetailModal({ exercise, onClose, onAskRex }) {
  const backdropRef = useRef(null)
  const catClass = CATEGORY_COLORS[exercise.category] ?? 'bg-gray-100 text-gray-700 border-gray-200'

  const muscles          = exercise.muscles_primary   ?? []
  const musclesSecondary = exercise.muscles_secondary ?? []

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === backdropRef.current) onClose()
  }

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      ref={backdropRef}
      onClick={handleBackdrop}
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="bg-white w-full sm:max-w-lg sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl max-h-[92dvh] flex flex-col">

        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1">

          {/* GIF */}
          <div className="w-full aspect-video bg-gray-50">
            {exercise.gif_url ? (
              <img
                src={exercise.gif_url}
                alt={exercise.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <GifPlaceholder category={exercise.category} />
            )}
          </div>

          <div className="px-5 py-4 space-y-5">

            {/* Name + badges */}
            <div>
              <h2 className="text-xl font-bold text-gray-900 capitalize leading-tight mb-2">
                {exercise.name}
              </h2>
              <div className="flex flex-wrap gap-2">
                <span className={`text-xs px-2.5 py-1 rounded-full border capitalize font-medium ${catClass}`}>
                  {exercise.category?.replace(/_/g, ' ')}
                </span>
                {exercise.experience_level && exercise.experience_level !== 'all' && (
                  <span className={`text-xs px-2.5 py-1 rounded-full capitalize ${LEVEL_COLORS[exercise.experience_level] ?? 'bg-gray-50 text-gray-500'}`}>
                    {exercise.experience_level}
                  </span>
                )}
              </div>
            </div>

            {/* Muscles */}
            {(muscles.length > 0 || musclesSecondary.length > 0) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Muscles</p>
                <div className="flex flex-wrap gap-1.5">
                  {muscles.map(m => (
                    <span key={m} className="text-xs bg-gray-900 text-white px-2.5 py-1 rounded-full capitalize">{m}</span>
                  ))}
                  {musclesSecondary.map(m => (
                    <span key={m} className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full capitalize">{m}</span>
                  ))}
                </div>
              </div>
            )}

            {/* How to do it — stored as a single text block in description_start */}
            {exercise.description_start && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">How to do it</p>
                <p className="text-sm text-gray-700 leading-relaxed">{exercise.description_start}</p>
              </div>
            )}

            {/* description_move — technique / movement cues */}
            {exercise.description_move && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Movement cues</p>
                <p className="text-sm text-gray-700 leading-relaxed">{exercise.description_move}</p>
              </div>
            )}

            {/* description_avoid — common errors to avoid */}
            {exercise.description_avoid && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Common errors to avoid</p>
                <p className="text-sm text-gray-700 leading-relaxed">{exercise.description_avoid}</p>
              </div>
            )}

            {/* Spacer so CTAs don't overlap content */}
            <div className="h-2" />
          </div>
        </div>

        {/* Sticky CTA bar */}
        <div className="flex-shrink-0 border-t border-gray-100 bg-white px-5 py-4 flex gap-3">
          <button
            onClick={() => onAskRex(exercise)}
            className="flex-1 flex items-center justify-center gap-2 border border-slate-300 hover:bg-slate-50 text-slate-800 font-semibold text-sm py-3 rounded-2xl transition-colors"
          >
            <span className="w-5 h-5 rounded-full bg-slate-800 text-white text-xs font-bold flex items-center justify-center shrink-0">R</span>
            Ask Rex
          </button>
          <button
            onClick={() => onAskRex(exercise, true)}
            className="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-semibold text-sm py-3 rounded-2xl transition-colors"
          >
            + Add to session
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ExerciseLibrary() {
  const { session } = useAuth()
  const navigate    = useNavigate()

  const [exercises, setExercises]   = useState([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [activeCategory, setCategory] = useState('all')
  const [selected, setSelected]     = useState(null)  // exercise open in detail modal

  // Fetch all exercises once on mount
  useEffect(() => {
    supabase
      .from('exercises')
      .select('*')
      .order('name', { ascending: true })
      .then(({ data }) => {
        setExercises(data ?? [])
        setLoading(false)
      })
  }, [])

  // Client-side filter
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return exercises.filter(e => {
      const matchesCategory = activeCategory === 'all' || e.category === activeCategory
      const matchesSearch   = !q
        || e.name?.toLowerCase().includes(q)
        || e.muscles_primary?.some(m => m.toLowerCase().includes(q))
        || e.category?.toLowerCase().includes(q)
      return matchesCategory && matchesSearch
    })
  }, [exercises, search, activeCategory])

  function handleAskRex(exercise, addToSession = false) {
    const msg = addToSession
      ? `Please add ${exercise.name} to one of my upcoming planned sessions.`
      : `Tell me about the ${exercise.name} — technique, common errors, and how it fits into my programme.`
    // Navigate to Rex chat; the message is passed via sessionStorage so it pre-fills
    sessionStorage.setItem('rex_prefill', msg)
    navigate('/chat/rex')
  }

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 pb-12">

      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Exercise Library</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          {loading ? 'Loading…' : `${exercises.length} exercises`}
        </p>
      </div>

      {/* ── Search ────────────────────────────────────────────────── */}
      <div className="relative mb-4">
        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">🔍</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search exercises or muscles…"
          className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-2xl bg-white focus:outline-none focus:ring-2 focus:ring-gray-300 shadow-sm"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Category filter chips ─────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-none">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`shrink-0 text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-colors ${
              activeCategory === cat.key
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Results count ─────────────────────────────────────────── */}
      {!loading && (search || activeCategory !== 'all') && (
        <p className="text-xs text-gray-400 mb-4">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''}
          {search && <> for "<span className="font-medium text-gray-600">{search}</span>"</>}
        </p>
      )}

      {/* ── Exercise grid ─────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-700 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-gray-400 text-sm">No exercises found.</p>
          {(search || activeCategory !== 'all') && (
            <button
              onClick={() => { setSearch(''); setCategory('all') }}
              className="mt-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map(ex => (
            <ExerciseCard
              key={ex.id}
              exercise={ex}
              onClick={() => setSelected(ex)}
            />
          ))}
        </div>
      )}

      {/* ── Detail modal ──────────────────────────────────────────── */}
      {selected && (
        <DetailModal
          exercise={selected}
          onClose={() => setSelected(null)}
          onAskRex={(ex, addToSession) => {
            setSelected(null)
            handleAskRex(ex, addToSession)
          }}
        />
      )}
    </main>
  )
}
