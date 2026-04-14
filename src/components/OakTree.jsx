// OakTree.jsx — Premium Biopsychosocial oak tree visualisation
// viewBox 0 0 300 360 | ground at y=300

import { useMemo } from 'react'

const STAGE_NAMES = ['', 'Acorn', 'Seedling', 'Sapling', 'Young Oak', 'Established', 'Mature Oak', 'Ancient Oak']

function getSeason(prop) {
  if (prop) return prop
  const m = new Date().getMonth()
  if (m === 11 || m <= 1) return 'winter'
  if (m <= 4) return 'spring'
  if (m <= 7) return 'summer'
  return 'autumn'
}

// ── COLOR SCIENCE ──────────────────────────────────────────────────────────

// Lerp between two hex colors
function lerpColor(c1, c2, t) {
  const hex2rgb = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
  const [r1, g1, b1] = hex2rgb(c1)
  const [r2, g2, b2] = hex2rgb(c2)
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r},${g},${b})`
}

function getTrunkColor(phys, emo) {
  // Base trunk color scales from warm pale taupe (weak) to deep clay/umber (strong)
  const base = lerpColor('#c4b9ad', '#4a4138', phys / 100)
  // If highly depressed (low emo), desaturate trunk towards cold grey
  if (emo < 40) {
    const factor = (40 - emo) / 40
    return lerpColor(base, '#8f8e8a', factor)
  }
  return base
}

function getCanopyColors(season, emo) {
  if (season === 'winter') return { base: null, highlight: null, shadow: null }

  let baseC, highC, shadC

  if (season === 'spring') {
    baseC = '#8ba18b'; highC = '#a8c2a8'; shadC = '#6b826b' // Soft spring sage
  } else if (season === 'summer') {
    baseC = '#627b58'; highC = '#7a966d'; shadC = '#4b6142' // Deep olive
  } else {
    baseC = '#b89d6e'; highC = '#d1b482'; shadC = '#90764e' // Autumn clay/mustard
  }

  // Melancholic weeping override — desaturation
  if (emo < 45) {
    const desatFac = (45 - emo) / 45
    baseC = lerpColor(baseC, '#a3a49f', desatFac)
    highC = lerpColor(highC, '#bfbfbb', desatFac)
    shadC = lerpColor(shadC, '#797975', desatFac)
  }

  return { base: baseC, highlight: highC, shadow: shadC }
}

// ── UTILITIES ──────────────────────────────────────────────────────────────

// Abstract Canopy Blob — elegant watercolor mix-blend overlapping
function CanopyGroup({ cx, cy, rx, ry, colors, weepAmt, swayAmt, stage }) {
  if (!colors.base) return null
  
  const droop = weepAmt * 0.4
  
  // Create beautiful abstract shapes rather than stiff circles
  return (
    <g className="canopy-group" style={{ mixBlendMode: 'multiply' }}>
      <ellipse cx={cx - rx * 0.3} cy={cy + droop} rx={rx * 0.8} ry={ry * 0.8 + droop * 0.5} fill={colors.shadow} opacity="0.65" />
      <ellipse cx={cx + rx * 0.4} cy={cy - ry * 0.1 + droop} rx={rx * 0.85} ry={ry * 0.9 + droop * 0.3} fill={colors.base} opacity="0.75" />
      <ellipse cx={cx - rx * 0.1} cy={cy - ry * 0.3 + droop * 0.8} rx={rx * 0.6} ry={ry * 0.6 + droop * 0.2} fill={colors.highlight} opacity="0.8" />
    </g>
  )
}

// ── STAGE RENDERING ────────────────────────────────────────────────────────

function drawTrunkPath(cx, base, height, width, bendAmt) {
  // If tree is top heavily social but low physical, it bends gracefully
  // bendAmt (-50 to +50 roughly). We map it to control points.
  const bendPx = bendAmt * 0.5
  
  // Base bezier control points for an organic sweeping trunk
  const y1 = base - height * 0.4
  const y2 = base - height * 0.8
  const topY = base - height
  
  return `M ${cx - width/2} ${base} 
          C ${cx - width/2 + bendPx*0.4} ${y1}, ${cx - width*0.3 + bendPx*0.8} ${y2}, ${cx - width*0.2 + bendPx} ${topY}
          L ${cx + width*0.2 + bendPx} ${topY}
          C ${cx + width*0.3 + bendPx*0.8} ${y2}, ${cx + width/2 + bendPx*0.4} ${y1}, ${cx + width/2} ${base} Z`
}

function Acorn() {
  return (
    <g transform="translate(0, 4)">
      <path d="M 150 288 C 158 288 160 293 160 295 C 150 305 140 295 140 295 C 140 293 142 288 150 288 Z" fill="#8f7a68" />
      <path d="M 143 288 C 143 283 157 283 157 288 Z" fill="#605448" />
      <line x1="150" y1="284" x2="151" y2="280" stroke="#4a4138" strokeWidth="2" strokeLinecap="round" />
    </g>
  )
}

function Seedling({ colors, tc }) {
  return (
    <g>
      <path d="M 149 300 Q 150 285 151 278" fill="none" stroke={tc} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M 151 278 Q 158 274 162 276 Q 156 280 151 278" fill={colors.highlight || '#888'} opacity="0.9" />
      <path d="M 151 281 Q 142 278 138 282 Q 144 285 151 281" fill={colors.base || '#666'} opacity="0.9" />
    </g>
  )
}

function TreeStage({ stage, phys, soc, emo, season }) {
  const cx = 150
  const base = 300
  
  // Calculate dynamic imbalance postures
  // High social / low physical = bending canopy
  const bendAmt = (soc - phys) * (stage / 7) 
  // Low emotional = weeping canopy, depressed verticals
  const weepAmt = Math.max(0, 50 - emo) * (stage / 7) * 0.8
  // High physical / low social = dense, squat, rooted
  const squatAmt = Math.max(0, phys - soc) * (stage / 7)
  
  const tc = getTrunkColor(phys, emo)
  const colors = getCanopyColors(season, emo)
  
  // Scale parameters based on growth stage
  const heightMult = [0, 0, 0, 0.4, 0.65, 0.85, 1.05, 1.25][stage]
  const spreadMult = [0, 0, 0, 0.35, 0.6, 0.85, 1.05, 1.3][stage]
  
  const trunkH = Math.max(20, (100 + phys * 0.5 - squatAmt * 0.3) * heightMult)
  const trunkW = Math.max(4, (8 + phys * 0.15 + squatAmt * 0.1) * heightMult)
  const spread = Math.max(20, (40 + soc * 0.6 - squatAmt * 0.2) * spreadMult)
  
  const bendOffset = bendAmt * 0.5
  const topY = base - trunkH

  // Winter bare branches logic
  const drawBranches = () => {
    const branches = []
    const bCount = Math.floor(stage * 1.5)
    for(let i=0; i<bCount; i++) {
        const spreadFactor = (i / bCount) * 2 - 1 // -1 to 1
        const xOffset = spreadFactor * spread * 0.7 + bendOffset
        const yOffset = topY - spread * 0.5 + Math.abs(spreadFactor) * 20 + weepAmt * 0.5
        branches.push(
          <path 
            key={i}
            d={`M ${cx + bendOffset*0.5} ${topY + trunkH*0.2} Q ${cx + xOffset*0.5} ${topY - 10} ${cx + xOffset} ${yOffset}`}
            fill="none" 
            stroke={tc} 
            strokeWidth={Math.max(1, trunkW * (0.4 - Math.abs(spreadFactor)*0.2))} 
            strokeLinecap="round" 
            opacity="0.85"
          />
        )
    }
    return branches
  }

  // Trunk roots logic
  const drawRoots = () => {
     if (stage < 4) return null
     const rWidth = trunkW * 1.5 + phys * 0.15
     return (
       <path 
         d={`M ${cx - trunkW/2} ${base - 5} C ${cx - rWidth} ${base + 2}, ${cx - rWidth*1.5} ${base + 5}, ${cx - rWidth*1.8} ${base + 8} 
             M ${cx + trunkW/2} ${base - 5} C ${cx + rWidth} ${base + 2}, ${cx + rWidth*1.5} ${base + 5}, ${cx + rWidth*1.8} ${base + 8}`}
         fill="none" stroke={tc} strokeWidth={trunkW * 0.3} strokeLinecap="round" opacity="0.8"
       />
     )
  }

  return (
    <g>
      {drawRoots()}
      
      {/* Primary elegant trunk */}
      <path d={drawTrunkPath(cx, base, trunkH, trunkW, bendAmt)} fill={tc} opacity="0.95" />
      
      {/* Winter Branches */}
      {(season === 'winter' || stage >= 5) && drawBranches()}

      {/* Modernist Canopy Abstractions */}
      {season !== 'winter' && stage >= 3 && (
        <g style={{ transformOrigin: `${cx}px ${base}px`, animation: 'canopy-breathe 8s ease-in-out infinite' }}>
          <CanopyGroup cx={cx + bendOffset} cy={topY - spread*0.1} rx={spread} ry={spread*0.75} colors={colors} weepAmt={weepAmt} />
          {stage >= 5 && (
            <>
              <CanopyGroup cx={cx + bendOffset - spread*0.45} cy={topY + spread*0.1} rx={spread*0.65} ry={spread*0.55} colors={colors} weepAmt={weepAmt} />
              <CanopyGroup cx={cx + bendOffset + spread*0.45} cy={topY + spread*0.1} rx={spread*0.65} ry={spread*0.55} colors={colors} weepAmt={weepAmt} />
            </>
          )}
          {stage >= 6 && (
            <CanopyGroup cx={cx + bendOffset} cy={topY - spread*0.4} rx={spread*0.8} ry={spread*0.6} colors={colors} weepAmt={weepAmt} />
          )}
        </g>
      )}
    </g>
  )
}

// ── MINIMALIST DATA TRACKERS ───────────────────────────────────────────────

function PremiumArcTracker({ score, label, color, yOffset }) {
  const pct = Math.max(0, Math.min(100, score))
  const width = 160
  const filled = (pct / 100) * width

  return (
    <g transform={`translate(70, ${325 + yOffset})`}>
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
  season = null,
}) {
  const stage = Math.max(1, Math.min(7, Math.round(growthStage)))
  const phys = Math.max(0, Math.min(100, physicalScore))
  const soc = Math.max(0, Math.min(100, socialScore))
  const emo = Math.max(0, Math.min(100, emotionalScore))
  const resolvedSeason = getSeason(season)

  // Use elegant, muted tones for the data bars corresponding to the theme
  const barColorPhys = "#627b58" // Sage
  const barColorSoc  = "#a68863" // Clay/Tan
  const barColorEmo  = "#708191" // Muted Slate

  const { tc, colors } = useMemo(() => ({
    tc: getTrunkColor(phys, emo),
    colors: getCanopyColors(resolvedSeason, emo)
  }), [phys, emo, resolvedSeason])

  return (
    <div className="w-full flex flex-col items-center select-none overflow-hidden pb-4">
      <style>{`
        @keyframes canopy-breathe {
          0%, 100% { transform: scale(1) rotate(0deg); }
          50%      { transform: scale(1.015) rotate(0.4deg); }
        }
      `}</style>

      {/* Floating Art Canvas (no forced sky box array) */}
      <svg viewBox="0 0 300 380" className="w-full h-auto max-w-[320px]" aria-label={`Oak tree — ${STAGE_NAMES[stage]}`}>
        
        {/* Soft elegant ground line */}
        <g opacity="0.5">
          <ellipse cx="150" cy="303" rx="110" ry="6" fill="#e8eae2" />
          <path d="M 40 300 Q 150 298 260 300" fill="none" stroke="#d5d9cf" strokeWidth="1" strokeLinecap="round" />
        </g>

        {/* Tree Render Router */}
        {stage === 1 ? <Acorn /> : 
         stage === 2 ? <Seedling colors={colors} tc={tc} /> : 
         <TreeStage stage={stage} phys={phys} soc={soc} emo={emo} season={resolvedSeason} />
        }

        {/* Premium Data Trackers below the ground line */}
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
