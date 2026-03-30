import { useState } from 'react'

/**
 * BlockReviewCard
 *
 * Appears on the last day of each 2-week block in the session planner.
 * Asks the user whether to repeat the current block or progress to the next.
 *
 * Props:
 *   blockNumber  {number}   — current block number (1-based)
 *   programmeId  {string}   — active programme UUID
 *   onRepeat     {function} — called when user chooses "repeat this block"
 *   onProgress   {function} — called when user chooses "ready to progress"
 */
export default function BlockReviewCard({ blockNumber, programmeId, onRepeat, onProgress }) {
  const [choice, setChoice]     = useState(null)   // null | 'repeat' | 'progress'
  const [saving, setSaving]     = useState(false)

  async function handleRepeat() {
    setSaving(true)
    await onRepeat()
    setChoice('repeat')
    setSaving(false)
  }

  async function handleProgress() {
    setSaving(true)
    await onProgress()
    setChoice('progress')
    setSaving(false)
  }

  if (choice) {
    return (
      <div className="mb-5 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 flex items-center gap-3">
        <span className="text-teal-600 text-lg">✓</span>
        <p className="text-sm font-medium text-teal-800">
          {choice === 'repeat'
            ? `Block ${blockNumber} repeated — same exercises loaded for the next 2 weeks.`
            : `Great — your next block will be ready when Rex builds it.`}
        </p>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-800 px-5 py-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">R</span>
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">
            How's this block feeling?
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            Block {blockNumber} ends today — time to check in.
          </p>
        </div>
      </div>

      <p className="text-slate-300 text-xs leading-relaxed mb-4">
        You've completed 2 weeks of the same exercise selection. Are the movements still feeling
        challenging, or are you ready to step it up?
      </p>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleProgress}
          disabled={saving}
          className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          Ready to progress →
        </button>
        <button
          onClick={handleRepeat}
          disabled={saving}
          className="w-full bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-200 text-sm font-medium py-2.5 rounded-xl transition-colors"
        >
          Still challenging — repeat this block
        </button>
      </div>
    </div>
  )
}
