import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { duplicateBlock } from '../utils/duplicateBlock'

/**
 * BlockReviewCard
 *
 * Shown at the top of the session planner at the end of each 2-week block.
 * Asks the user whether to repeat the current block or progress to the next.
 *
 * Props:
 *   blockNumber  {number}   — current block number (1-based)
 *   programmeId  {string}   — active programme UUID
 *   onRepeat     {function} — called after repeat choice is saved
 *   onProgress   {function} — called after progress choice is saved
 */
export default function BlockReviewCard({ blockNumber, programmeId, onRepeat, onProgress }) {
  const [saving, setSaving]       = useState(false)
  const [confirmed, setConfirmed] = useState(false)

  async function handleProgress() {
    setSaving(true)
    try {
      const { data: prog } = await supabase
        .from('programmes')
        .select('block_review_status')
        .eq('id', programmeId)
        .single()
      const current = prog?.block_review_status ?? {}
      await supabase
        .from('programmes')
        .update({ block_review_status: { ...current, [String(blockNumber)]: 'progress' } })
        .eq('id', programmeId)
    } catch (_) { /* silent */ }

    setConfirmed(true)
    setSaving(false)
    setTimeout(() => onProgress(), 2000)
  }

  async function handleRepeat() {
    setSaving(true)
    try {
      // 1. Record the choice in programmes
      const { data: prog } = await supabase
        .from('programmes')
        .select('block_review_status')
        .eq('id', programmeId)
        .single()
      const current = prog?.block_review_status ?? {}
      await supabase
        .from('programmes')
        .update({ block_review_status: { ...current, [String(blockNumber)]: 'repeat' } })
        .eq('id', programmeId)

      // 2. Duplicate the block sessions
      await duplicateBlock(programmeId, blockNumber, supabase)
    } catch (_) { /* silent */ }

    setConfirmed(true)
    setSaving(false)
    setTimeout(() => onRepeat(), 2000)
  }

  if (confirmed) {
    return (
      <div className="mb-5 rounded-2xl border border-teal-200 bg-teal-50 px-5 py-4 flex items-center gap-3">
        <span className="text-teal-500 text-xl">✓</span>
        <p className="text-sm font-medium text-teal-800">
          Got it — your choice has been saved.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-5 rounded-2xl border border-slate-700 bg-[#1A3A5C] px-5 py-5 shadow-sm">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-full bg-[#0f2540] flex items-center justify-center shrink-0">
          <span className="text-white text-sm font-bold">R</span>
        </div>
        <div>
          <p className="text-white font-semibold text-sm leading-tight">
            How's Block {blockNumber} feeling?
          </p>
          <p className="text-slate-400 text-xs mt-0.5">
            Take a moment before we build your next block.
          </p>
        </div>
      </div>

      <p className="text-slate-300 text-xs leading-relaxed mb-4">
        You've completed 2 weeks with the same exercise selection. Are the movements
        still challenging, or are you ready to step it up?
      </p>

      <div className="flex flex-col gap-2">
        {/* Primary — repeat */}
        <button
          onClick={handleRepeat}
          disabled={saving}
          className="w-full bg-[#1A3A5C] hover:bg-[#0f2540] disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl border border-slate-500 transition-colors"
        >
          Still challenging — repeat this block
        </button>

        {/* Secondary — progress */}
        <button
          onClick={handleProgress}
          disabled={saving}
          className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
        >
          Ready to progress →
        </button>
      </div>
    </div>
  )
}
