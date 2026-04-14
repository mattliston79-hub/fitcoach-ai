// OakTree.jsx — Premium Biopsychosocial oak tree visualisation using AI botanical illustrations
// The SVG logic manages the data tracking rings below the tree image.

import { useMemo } from 'react'

const STAGE_NAMES = ['', 'Acorn', 'Seedling', 'Sapling', 'Young Oak', 'Established', 'Mature Oak', 'Ancient Oak']

// ── MINIMALIST DATA TRACKERS ───────────────────────────────────────────────

function PremiumArcTracker({ score, label, color, yOffset }) {
  const pct = Math.max(0, Math.min(100, score))
  const width = 160
  const filled = (pct / 100) * width

  return (
    <g transform={`translate(70, ${15 + yOffset})`}>
      <text x="-12" y="3" fontSize="8" fill="#8c9088" textAnchor="end" letterSpacing="0.05em" fontFamily="Outfit, sans-serif" fontWeight="600" textTransform="uppercase">{label}</text>
      <rect x="0" y="0" width={width} height="3" rx="1.5" fill="#e5e7e0" />
      {pct > 0 && <rect x="0" y="0" width={filled} height="3" rx="1.5" fill={color} opacity="0.8" />}
      <text x={width + 12} y="3" fontSize="8" fill="#5d6259" fontFamily="Outfit, sans-serif" fontWeight="700">{score}</text>
    </g>
  )
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────

export default function OakTree({
  growthStage = 1,
  physicalScore = 0,
  socialScore = 0,
  emotionalScore = 0,
}) {
  const stage = Math.max(1, Math.min(7, Math.round(growthStage)))
  const phys = Math.max(0, Math.min(100, physicalScore))
  const soc = Math.max(0, Math.min(100, socialScore))
  const emo = Math.max(0, Math.min(100, emotionalScore))

  // Use elegant, muted tones for the data bars corresponding to the theme
  const barColorPhys = "#627b58" // Sage
  const barColorSoc  = "#a68863" // Clay/Tan
  const barColorEmo  = "#708191" // Muted Slate

  // Since Nano Banana outputs 1024x1024 distinct images, we wrap them in a container that scales down gracefully
  const imagePath = `/tree_stages/stage_${stage}.png`

  return (
    <div className="w-full flex flex-col items-center select-none overflow-hidden pb-4">
      {/* AI Botanical Image Canvas */}
      <div className="relative w-full aspect-square max-w-[320px] flex items-end justify-center mix-blend-multiply">
        <img 
          src={imagePath} 
          alt={`Oak tree — ${STAGE_NAMES[stage]}`}
          className="w-full h-full object-cover transition-opacity duration-500 rounded-[1.5rem]"
        />
      </div>

      {/* Premium Data Trackers */}
      <svg viewBox="0 0 300 70" className="w-full h-auto max-w-[320px] mt-1" aria-label="Wellbeing Data Trackers">
        <PremiumArcTracker score={phys} label="Phys" color={barColorPhys} yOffset={0} />
        <PremiumArcTracker score={soc} label="Socl" color={barColorSoc} yOffset={14} />
        <PremiumArcTracker score={emo} label="Emot" color={barColorEmo} yOffset={28} />
      </svg>
      
      {/* Editorial Stage Label */}
      <h3 className="font-serif text-lg text-teal-900/80 font-semibold tracking-wide capitalize mt-2">
        {STAGE_NAMES[stage]}
      </h3>
    </div>
  )
}
