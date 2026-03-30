import { useState } from 'react'

/**
 * ProgrammeSummaryCollapsible
 *
 * "How Rex built this" — collapsed by default, expands to show Rex's
 * clinical reasoning behind the current programme.
 *
 * Props:
 *   programmeAim               {string}  — top-level goal Rex identified
 *   phaseAim                   {string}  — aim for this phase/block
 *   sessionAllocationRationale {string}  — why sessions were structured this way
 *   capabilityGapProfile       {object}  — optional JSONB from programmes table
 *     .starting_point          {string}
 *     .goal_requirements       {string}
 */
export default function ProgrammeSummaryCollapsible({
  programmeAim,
  phaseAim,
  sessionAllocationRationale,
  capabilityGapProfile,
}) {
  const [open, setOpen] = useState(false)

  const startingPoint    = capabilityGapProfile?.starting_point   ?? null
  const goalRequirements = capabilityGapProfile?.goal_requirements ?? null

  // Nothing meaningful to show
  if (!programmeAim && !phaseAim && !sessionAllocationRationale) return null

  return (
    <div className="rounded-2xl border border-slate-700 bg-[#132d4a] overflow-hidden">

      {/* Trigger row */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-teal-400 text-sm font-semibold tracking-wide">
          How Rex built this
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={[
            'w-4 h-4 text-teal-400 shrink-0 transition-transform duration-300',
            open ? 'rotate-180' : '',
          ].join(' ')}
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {/* Expandable body */}
      <div
        className={[
          'transition-all duration-300 ease-in-out overflow-hidden',
          open ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0',
        ].join(' ')}
      >
        <div className="px-5 pb-5 flex flex-col gap-5 border-t border-slate-700 pt-4">

          {/* YOUR STARTING POINT */}
          {startingPoint && (
            <Section
              title="YOUR STARTING POINT"
              body={startingPoint}
            />
          )}

          {/* WHAT YOUR GOAL ACTUALLY REQUIRES */}
          {goalRequirements && (
            <Section
              title="WHAT YOUR GOAL ACTUALLY REQUIRES"
              body={goalRequirements}
            />
          )}

          {/* WHY REX STRUCTURED IT THIS WAY */}
          {sessionAllocationRationale && (
            <Section
              title="WHY REX STRUCTURED IT THIS WAY"
              body={sessionAllocationRationale}
            />
          )}

          {/* THIS BLOCK'S TARGET */}
          {phaseAim && (
            <Section
              title="THIS BLOCK'S TARGET"
              body={phaseAim}
            />
          )}

          {/* Close link */}
          <button
            onClick={() => setOpen(false)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors text-left mt-1"
          >
            Close
          </button>

        </div>
      </div>
    </div>
  )
}

function Section({ title, body }) {
  return (
    <div>
      <p className="text-teal-500 text-[10px] font-bold tracking-widest uppercase mb-1.5">
        {title}
      </p>
      <p className="text-slate-300 text-xs leading-relaxed">
        {body}
      </p>
    </div>
  )
}
