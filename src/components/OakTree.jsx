// OakTree.jsx — biopsychosocial oak tree visualisation
// viewBox 0 0 300 360 | ground at y=300

const STAGE_NAMES = ['', 'Acorn', 'Seedling', 'Sapling', 'Young Oak', 'Established', 'Mature Oak', 'Ancient Oak']

function getSeason(prop) {
  if (prop) return prop
  const m = new Date().getMonth()
  if (m === 11 || m <= 1) return 'winter'
  if (m <= 4) return 'spring'
  if (m <= 7) return 'summer'
  return 'autumn'
}

// Leaf colour palette by season × emotional score
function leafColour(season, score) {
  const t = score / 100
  if (season === 'winter') return null // no leaves
  if (season === 'spring') {
    // yellow-green → vivid green
    const r = Math.round(180 - t * 60)
    const g = Math.round(190 + t * 50)
    const b = Math.round(80 - t * 40)
    return `rgb(${r},${g},${b})`
  }
  if (season === 'summer') {
    // pale green → deep rich green
    const r = Math.round(120 - t * 70)
    const g = Math.round(160 + t * 40)
    const b = Math.round(60 - t * 20)
    return `rgb(${r},${g},${b})`
  }
  // autumn: dull brown → vibrant amber/orange
  const r = Math.round(160 + t * 60)
  const g = Math.round(90 + t * 70)
  const b = Math.round(20)
  return `rgb(${r},${g},${b})`
}

// Trunk colour deepens with physicalScore
function trunkColour(score) {
  const t = score / 100
  const r = Math.round(101 - t * 20)
  const g = Math.round(67 - t * 15)
  const b = Math.round(33 - t * 10)
  return `rgb(${r},${g},${b})`
}

// Arc indicator — draws a circular arc from top, fills clockwise
function ScoreArc({ cx, cy, r, score, colour, label }) {
  const pct = Math.max(0, Math.min(1, score / 100))
  const angle = pct * 2 * Math.PI
  const startX = cx
  const startY = cy - r
  const endX = cx + r * Math.sin(angle)
  const endY = cy - r * Math.cos(angle)
  const large = pct > 0.5 ? 1 : 0

  return (
    <g>
      {/* track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
      {/* fill */}
      {pct > 0 && (
        <path
          d={pct >= 0.9999
            ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.001} ${cy - r}`
            : `M ${startX} ${startY} A ${r} ${r} 0 ${large} 1 ${endX} ${endY}`}
          fill="none"
          stroke={colour}
          strokeWidth="3"
          strokeLinecap="round"
        />
      )}
      <title>{label}: {score}</title>
    </g>
  )
}

// ─── Stage renderers ────────────────────────────────────────────────────────

function Acorn() {
  return (
    <g>
      {/* cap */}
      <ellipse cx="150" cy="286" rx="10" ry="5" fill="#6b4f2a" />
      <rect x="149" y="281" width="2" height="5" fill="#4a3218" />
      {/* body */}
      <ellipse cx="150" cy="293" rx="8" ry="10" fill="#a07840" />
      <ellipse cx="150" cy="290" rx="7" ry="4" fill="#b89050" opacity="0.5" />
    </g>
  )
}

function Seedling({ lc }) {
  return (
    <g>
      {/* tiny trunk */}
      <rect x="148.5" y="280" width="3" height="20" rx="1.5" fill="#8b6340" />
      {/* two small leaves */}
      <ellipse cx="144" cy="276" rx="6" ry="3.5" fill={lc} transform="rotate(-30,144,276)" />
      <ellipse cx="156" cy="274" rx="6" ry="3.5" fill={lc} transform="rotate(30,156,274)" />
      <ellipse cx="150" cy="272" rx="5" ry="3" fill={lc} />
    </g>
  )
}

function Sapling({ tc, lc, phys, soc, season }) {
  const trunkH = 60
  const trunkW = 5 + phys * 0.04
  const cx = 150
  const base = 300
  const spread = 20 + soc * 0.2

  return (
    <g>
      <rect x={cx - trunkW / 2} y={base - trunkH} width={trunkW} height={trunkH} rx={trunkW / 2} fill={tc} />
      {season !== 'winter' && (
        <>
          <ellipse cx={cx} cy={base - trunkH - 10} rx={spread} ry={spread * 0.65} fill={lc} opacity="0.9" />
          <ellipse cx={cx - spread * 0.5} cy={base - trunkH} rx={spread * 0.6} ry={spread * 0.45} fill={lc} opacity="0.8" />
          <ellipse cx={cx + spread * 0.5} cy={base - trunkH} rx={spread * 0.6} ry={spread * 0.45} fill={lc} opacity="0.8" />
        </>
      )}
      {season === 'winter' && (
        <>
          <line x1={cx} y1={base - trunkH} x2={cx - 15} y2={base - trunkH - 18} stroke={tc} strokeWidth="2" />
          <line x1={cx} y1={base - trunkH} x2={cx + 15} y2={base - trunkH - 18} stroke={tc} strokeWidth="2" />
        </>
      )}
    </g>
  )
}

function YoungOak({ tc, lc, phys, soc, season }) {
  const trunkH = 100
  const trunkW = 8 + phys * 0.06
  const cx = 150
  const base = 300
  const spread = 32 + soc * 0.28

  return (
    <g>
      {/* roots — subtle */}
      {phys > 30 && (
        <>
          <path d={`M${cx - trunkW / 2} ${base} Q${cx - 18} ${base + 4} ${cx - 28} ${base + 2}`} fill="none" stroke={tc} strokeWidth="2.5" />
          <path d={`M${cx + trunkW / 2} ${base} Q${cx + 18} ${base + 4} ${cx + 28} ${base + 2}`} fill="none" stroke={tc} strokeWidth="2.5" />
        </>
      )}
      {/* trunk */}
      <path
        d={`M${cx - trunkW / 2} ${base} Q${cx - trunkW * 0.6} ${base - trunkH * 0.5} ${cx - trunkW * 0.3} ${base - trunkH}`}
        fill="none" stroke={tc} strokeWidth={trunkW} strokeLinecap="round"
      />
      <path
        d={`M${cx + trunkW / 2} ${base} Q${cx + trunkW * 0.6} ${base - trunkH * 0.5} ${cx + trunkW * 0.3} ${base - trunkH}`}
        fill="none" stroke={tc} strokeWidth={trunkW * 0.5} strokeLinecap="round"
      />
      <rect x={cx - trunkW / 2} y={base - trunkH} width={trunkW} height={trunkH * 0.6} rx={trunkW / 3} fill={tc} />
      {season !== 'winter' && (
        <>
          <ellipse cx={cx} cy={base - trunkH - 14} rx={spread} ry={spread * 0.62} fill={lc} opacity="0.9" />
          <ellipse cx={cx - spread * 0.55} cy={base - trunkH - 4} rx={spread * 0.65} ry={spread * 0.48} fill={lc} opacity="0.85" />
          <ellipse cx={cx + spread * 0.55} cy={base - trunkH - 4} rx={spread * 0.65} ry={spread * 0.48} fill={lc} opacity="0.85" />
          <ellipse cx={cx - spread * 0.25} cy={base - trunkH - 24} rx={spread * 0.55} ry={spread * 0.4} fill={lc} opacity="0.8" />
          <ellipse cx={cx + spread * 0.25} cy={base - trunkH - 24} rx={spread * 0.55} ry={spread * 0.4} fill={lc} opacity="0.8" />
        </>
      )}
      {season === 'winter' && (
        <>
          <line x1={cx} y1={base - trunkH} x2={cx - spread * 0.7} y2={base - trunkH - 28} stroke={tc} strokeWidth="3" />
          <line x1={cx} y1={base - trunkH} x2={cx + spread * 0.7} y2={base - trunkH - 28} stroke={tc} strokeWidth="3" />
          <line x1={cx - spread * 0.3} y1={base - trunkH - 12} x2={cx - spread * 0.7} y2={base - trunkH - 38} stroke={tc} strokeWidth="1.5" />
          <line x1={cx + spread * 0.3} y1={base - trunkH - 12} x2={cx + spread * 0.7} y2={base - trunkH - 38} stroke={tc} strokeWidth="1.5" />
        </>
      )}
    </g>
  )
}

function EstablishedOak({ tc, lc, phys, soc, season }) {
  const trunkH = 150
  const trunkW = 14 + phys * 0.08
  const cx = 150
  const base = 300
  const spread = 50 + soc * 0.35

  return (
    <g>
      {/* roots */}
      <path d={`M${cx - trunkW / 2} ${base} Q${cx - 30} ${base + 5} ${cx - 50} ${base + 3}`} fill="none" stroke={tc} strokeWidth="3.5" />
      <path d={`M${cx + trunkW / 2} ${base} Q${cx + 30} ${base + 5} ${cx + 50} ${base + 3}`} fill="none" stroke={tc} strokeWidth="3.5" />
      {phys > 50 && (
        <>
          <path d={`M${cx - trunkW * 0.3} ${base} Q${cx - 15} ${base + 8} ${cx - 35} ${base + 7}`} fill="none" stroke={tc} strokeWidth="2" />
          <path d={`M${cx + trunkW * 0.3} ${base} Q${cx + 15} ${base + 8} ${cx + 35} ${base + 7}`} fill="none" stroke={tc} strokeWidth="2" />
        </>
      )}
      {/* trunk with gentle taper */}
      <path
        d={`M${cx - trunkW / 2} ${base} C${cx - trunkW * 0.55} ${base - trunkH * 0.4} ${cx - trunkW * 0.35} ${base - trunkH * 0.7} ${cx - trunkW * 0.25} ${base - trunkH}`}
        fill={tc}
      />
      <path
        d={`M${cx + trunkW / 2} ${base} C${cx + trunkW * 0.55} ${base - trunkH * 0.4} ${cx + trunkW * 0.35} ${base - trunkH * 0.7} ${cx + trunkW * 0.25} ${base - trunkH}`}
        fill={tc}
      />
      <rect x={cx - trunkW * 0.25} y={base - trunkH} width={trunkW * 0.5} height={20} fill={tc} />
      {/* main branches */}
      <path d={`M${cx - 4} ${base - trunkH} Q${cx - spread * 0.6} ${base - trunkH - 20} ${cx - spread * 0.85} ${base - trunkH - 40}`} fill="none" stroke={tc} strokeWidth="5" />
      <path d={`M${cx + 4} ${base - trunkH} Q${cx + spread * 0.6} ${base - trunkH - 20} ${cx + spread * 0.85} ${base - trunkH - 40}`} fill="none" stroke={tc} strokeWidth="5" />
      <path d={`M${cx} ${base - trunkH} Q${cx - spread * 0.2} ${base - trunkH - 30} ${cx - spread * 0.3} ${base - trunkH - 60}`} fill="none" stroke={tc} strokeWidth="4" />
      <path d={`M${cx} ${base - trunkH} Q${cx + spread * 0.15} ${base - trunkH - 35} ${cx + spread * 0.2} ${base - trunkH - 65}`} fill="none" stroke={tc} strokeWidth="4" />
      {season !== 'winter' && (
        <>
          <ellipse cx={cx} cy={base - trunkH - 50} rx={spread} ry={spread * 0.6} fill={lc} opacity="0.88" className="oak-canopy" />
          <ellipse cx={cx - spread * 0.65} cy={base - trunkH - 30} rx={spread * 0.62} ry={spread * 0.48} fill={lc} opacity="0.85" className="oak-canopy" />
          <ellipse cx={cx + spread * 0.65} cy={base - trunkH - 30} rx={spread * 0.62} ry={spread * 0.48} fill={lc} opacity="0.85" className="oak-canopy" />
          <ellipse cx={cx - spread * 0.3} cy={base - trunkH - 72} rx={spread * 0.5} ry={spread * 0.4} fill={lc} opacity="0.82" className="oak-canopy" />
          <ellipse cx={cx + spread * 0.3} cy={base - trunkH - 72} rx={spread * 0.5} ry={spread * 0.4} fill={lc} opacity="0.82" className="oak-canopy" />
          <ellipse cx={cx} cy={base - trunkH - 80} rx={spread * 0.4} ry={spread * 0.32} fill={lc} opacity="0.78" className="oak-canopy" />
        </>
      )}
      {season === 'winter' && (
        <>
          <path d={`M${cx - 4} ${base - trunkH} L${cx - spread * 0.85} ${base - trunkH - 40}`} fill="none" stroke={tc} strokeWidth="4" />
          <path d={`M${cx + 4} ${base - trunkH} L${cx + spread * 0.85} ${base - trunkH - 40}`} fill="none" stroke={tc} strokeWidth="4" />
          {[[-0.9,-55,-0.55,-75],[0.9,-55,0.55,-75],[-0.4,-65,-0.2,-85],[0.4,-65,0.2,-85],[-0.85,-40,-1.1,-55],[0.85,-40,1.1,-55]].map(([x1,y1,x2,y2],i) => (
            <line key={i} x1={cx+x1*spread*0.5} y1={base-trunkH+y1} x2={cx+x2*spread*0.5} y2={base-trunkH+y2} stroke={tc} strokeWidth="2" />
          ))}
        </>
      )}
    </g>
  )
}

function MatureOak({ tc, lc, phys, soc, season }) {
  const trunkH = 170
  const trunkW = 22 + phys * 0.1
  const cx = 150
  const base = 300
  const spread = 65 + soc * 0.4

  // slight texture lines on trunk
  const textureLines = []
  for (let i = 0; i < 4; i++) {
    const y = base - 40 - i * 30
    textureLines.push(
      <path key={i} d={`M${cx - trunkW * 0.4} ${y} Q${cx} ${y - 5} ${cx + trunkW * 0.4} ${y}`}
        fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="1.5" />
    )
  }

  return (
    <g>
      {/* roots — visible and spreading */}
      {[[-1,6,-60,5],[-0.6,9,-40,10],[0.6,9,40,10],[1,6,60,5],[-0.3,12,-20,14],[0.3,12,20,14]].map(([ax,ay,bx,by],i) => (
        <path key={i} d={`M${cx+ax*trunkW*0.4} ${base} Q${cx+ax*trunkW*0.4+bx*0.4} ${base+ay} ${cx+bx} ${base+by}`}
          fill="none" stroke={tc} strokeWidth={3 - i * 0.3} />
      ))}
      {/* trunk */}
      <path
        d={`M${cx - trunkW / 2} ${base} C${cx - trunkW * 0.6} ${base - trunkH * 0.35} ${cx - trunkW * 0.38} ${base - trunkH * 0.65} ${cx - trunkW * 0.22} ${base - trunkH}`}
        fill={tc}
      />
      <path
        d={`M${cx + trunkW / 2} ${base} C${cx + trunkW * 0.6} ${base - trunkH * 0.35} ${cx + trunkW * 0.38} ${base - trunkH * 0.65} ${cx + trunkW * 0.22} ${base - trunkH}`}
        fill={tc}
      />
      <rect x={cx - trunkW * 0.22} y={base - trunkH} width={trunkW * 0.44} height={25} fill={tc} />
      {textureLines}
      {/* branches */}
      {[
        [cx, base-trunkH, cx-spread*0.9, base-trunkH-50, 7],
        [cx, base-trunkH, cx+spread*0.9, base-trunkH-50, 7],
        [cx, base-trunkH, cx-spread*0.45, base-trunkH-75, 5],
        [cx, base-trunkH, cx+spread*0.45, base-trunkH-75, 5],
        [cx, base-trunkH, cx, base-trunkH-90, 5],
      ].map(([x1,y1,x2,y2,w],i) => (
        <path key={i} d={`M${x1} ${y1} Q${(x1+x2)/2+((i%2===0)?-10:10)} ${(y1+y2)/2-10} ${x2} ${y2}`}
          fill="none" stroke={tc} strokeWidth={w} strokeLinecap="round" />
      ))}
      {season !== 'winter' && (
        <>
          <ellipse cx={cx} cy={base-trunkH-60} rx={spread} ry={spread*0.58} fill={lc} opacity="0.87" className="oak-canopy" />
          <ellipse cx={cx-spread*0.7} cy={base-trunkH-40} rx={spread*0.65} ry={spread*0.5} fill={lc} opacity="0.84" className="oak-canopy" />
          <ellipse cx={cx+spread*0.7} cy={base-trunkH-40} rx={spread*0.65} ry={spread*0.5} fill={lc} opacity="0.84" className="oak-canopy" />
          <ellipse cx={cx-spread*0.38} cy={base-trunkH-88} rx={spread*0.52} ry={spread*0.42} fill={lc} opacity="0.81" className="oak-canopy" />
          <ellipse cx={cx+spread*0.38} cy={base-trunkH-88} rx={spread*0.52} ry={spread*0.42} fill={lc} opacity="0.81" className="oak-canopy" />
          <ellipse cx={cx} cy={base-trunkH-100} rx={spread*0.45} ry={spread*0.36} fill={lc} opacity="0.77" className="oak-canopy" />
          <ellipse cx={cx-spread*0.82} cy={base-trunkH-62} rx={spread*0.38} ry={spread*0.3} fill={lc} opacity="0.75" className="oak-canopy" />
          <ellipse cx={cx+spread*0.82} cy={base-trunkH-62} rx={spread*0.38} ry={spread*0.3} fill={lc} opacity="0.75" className="oak-canopy" />
        </>
      )}
      {season === 'winter' && (
        <>
          {[[-0.9,-50,7],[-0.45,-75,5],[0.45,-75,5],[0.9,-50,7],[0,-90,5],[-1.1,-68,3],[1.1,-68,3]].map(([xf,dy,w],i) => (
            <path key={i} d={`M${cx} ${base-trunkH} Q${cx+xf*spread*0.5} ${base-trunkH+dy*0.5} ${cx+xf*spread} ${base-trunkH+dy}`}
              fill="none" stroke={tc} strokeWidth={w} strokeLinecap="round" />
          ))}
        </>
      )}
    </g>
  )
}

function AncientOak({ tc, lc, phys, soc, season }) {
  const trunkH = 185
  const trunkW = 32 + phys * 0.12
  const cx = 150
  const base = 300
  const spread = 80 + soc * 0.45

  const textureLines = []
  for (let i = 0; i < 6; i++) {
    const y = base - 30 - i * 28
    const wobble = (i % 2 === 0 ? 1 : -1) * 4
    textureLines.push(
      <path key={i}
        d={`M${cx - trunkW*0.45} ${y} C${cx - trunkW*0.2} ${y+wobble} ${cx + trunkW*0.2} ${y-wobble} ${cx + trunkW*0.45} ${y}`}
        fill="none" stroke="rgba(0,0,0,0.12)" strokeWidth="2" />
    )
  }

  return (
    <g>
      {/* deep roots — gnarled */}
      {[[-1,4,-70,3],[-0.7,8,-50,9],[-0.35,12,-25,14],[0.35,12,25,14],[0.7,8,50,9],[1,4,70,3],[-0.15,15,-8,16],[0.15,15,8,16]].map(([ax,ay,bx,by],i) => (
        <path key={i}
          d={`M${cx+ax*trunkW*0.4} ${base} Q${cx+bx*0.5} ${base+ay} ${cx+bx} ${base+by}`}
          fill="none" stroke={tc} strokeWidth={Math.max(1.5, 4 - i * 0.4)} />
      ))}
      {/* massive trunk — slightly irregular */}
      <path
        d={`M${cx - trunkW/2} ${base}
            C${cx - trunkW*0.65} ${base - trunkH*0.25}
              ${cx - trunkW*0.55} ${base - trunkH*0.55}
              ${cx - trunkW*0.28} ${base - trunkH*0.78}
            Q${cx - trunkW*0.2} ${base - trunkH*0.9} ${cx - trunkW*0.18} ${base - trunkH}`}
        fill={tc}
      />
      <path
        d={`M${cx + trunkW/2} ${base}
            C${cx + trunkW*0.65} ${base - trunkH*0.25}
              ${cx + trunkW*0.58} ${base - trunkH*0.55}
              ${cx + trunkW*0.3}  ${base - trunkH*0.78}
            Q${cx + trunkW*0.22} ${base - trunkH*0.9} ${cx + trunkW*0.18} ${base - trunkH}`}
        fill={tc}
      />
      <rect x={cx - trunkW*0.18} y={base - trunkH} width={trunkW*0.36} height={30} fill={tc} />
      {/* hollow hint */}
      <ellipse cx={cx} cy={base - 60} rx={trunkW*0.18} ry={trunkW*0.25} fill="rgba(0,0,0,0.18)" />
      {textureLines}
      {/* massive branch network */}
      {[
        [cx, base-trunkH, cx-spread*0.95, base-trunkH-55, 9, -15],
        [cx, base-trunkH, cx+spread*0.95, base-trunkH-55, 9, 15],
        [cx, base-trunkH, cx-spread*0.52, base-trunkH-85, 7, -5],
        [cx, base-trunkH, cx+spread*0.52, base-trunkH-85, 7, 5],
        [cx, base-trunkH, cx, base-trunkH-100, 7, 0],
        [cx-spread*0.52, base-trunkH-85, cx-spread*0.8, base-trunkH-115, 4, -8],
        [cx+spread*0.52, base-trunkH-85, cx+spread*0.8, base-trunkH-115, 4, 8],
      ].map(([x1,y1,x2,y2,w,qoff],i) => (
        <path key={i}
          d={`M${x1} ${y1} Q${(x1+x2)/2+qoff} ${(y1+y2)/2-15} ${x2} ${y2}`}
          fill="none" stroke={tc} strokeWidth={w} strokeLinecap="round" />
      ))}
      {season !== 'winter' && (
        <>
          <ellipse cx={cx} cy={base-trunkH-68} rx={spread} ry={spread*0.55} fill={lc} opacity="0.86" className="oak-canopy" />
          <ellipse cx={cx-spread*0.72} cy={base-trunkH-48} rx={spread*0.68} ry={spread*0.52} fill={lc} opacity="0.83" className="oak-canopy" />
          <ellipse cx={cx+spread*0.72} cy={base-trunkH-48} rx={spread*0.68} ry={spread*0.52} fill={lc} opacity="0.83" className="oak-canopy" />
          <ellipse cx={cx-spread*0.4}  cy={base-trunkH-95} rx={spread*0.55} ry={spread*0.43} fill={lc} opacity="0.8" className="oak-canopy" />
          <ellipse cx={cx+spread*0.4}  cy={base-trunkH-95} rx={spread*0.55} ry={spread*0.43} fill={lc} opacity="0.8" className="oak-canopy" />
          <ellipse cx={cx} cy={base-trunkH-108} rx={spread*0.48} ry={spread*0.38} fill={lc} opacity="0.76" className="oak-canopy" />
          <ellipse cx={cx-spread*0.88} cy={base-trunkH-70} rx={spread*0.4} ry={spread*0.32} fill={lc} opacity="0.74" className="oak-canopy" />
          <ellipse cx={cx+spread*0.88} cy={base-trunkH-70} rx={spread*0.4} ry={spread*0.32} fill={lc} opacity="0.74" className="oak-canopy" />
          <ellipse cx={cx-spread*0.62} cy={base-trunkH-112} rx={spread*0.35} ry={spread*0.28} fill={lc} opacity="0.7" className="oak-canopy" />
          <ellipse cx={cx+spread*0.62} cy={base-trunkH-112} rx={spread*0.35} ry={spread*0.28} fill={lc} opacity="0.7" className="oak-canopy" />
        </>
      )}
      {season === 'winter' && (
        <>
          {[[-0.95,-55,9,-20],[-0.52,-85,7,-8],[0.52,-85,7,8],[0.95,-55,9,20],[0,-100,7,0],[-0.8,-115,4,-5],[0.8,-115,4,5],[-1.15,-75,3,-10],[1.15,-75,3,10]].map(([xf,dy,w,qoff],i) => (
            <path key={i}
              d={`M${cx} ${base-trunkH} Q${cx+xf*spread*0.5+qoff} ${base-trunkH+dy*0.5-15} ${cx+xf*spread} ${base-trunkH+dy}`}
              fill="none" stroke={tc} strokeWidth={w} strokeLinecap="round" />
          ))}
        </>
      )}
      {/* lichen dots for winter + high emotional */}
      {season === 'winter' && (
        <>
          {[[-8,-90],[10,-120],[-15,-155],[12,-75],[5,-140]].map(([dx,dy],i) => (
            <circle key={i} cx={cx+dx} cy={base+dy} r="2.5" fill="#8fbc8f" opacity="0.5" />
          ))}
        </>
      )}
    </g>
  )
}

// ─── Falling leaves (autumn animation) ──────────────────────────────────────
function FallingLeaves({ lc, count }) {
  const leaves = Array.from({ length: count }, (_, i) => ({
    id: i,
    x: 90 + (i * 37) % 120,
    delay: i * 0.8,
    size: 4 + (i % 3),
  }))
  return (
    <g>
      <style>{`
        @keyframes leaf-fall {
          0%   { transform: translate(0,0) rotate(0deg);   opacity: 0.9; }
          100% { transform: translate(${-20 + Math.random()*40}px, 60px) rotate(180deg); opacity: 0; }
        }
      `}</style>
      {leaves.map(l => (
        <ellipse
          key={l.id}
          cx={l.x} cy={220} rx={l.size} ry={l.size * 0.6}
          fill={lc} opacity="0.7"
          style={{
            animation: `leaf-fall ${2.5 + l.id * 0.3}s ${l.delay}s ease-in infinite`,
          }}
        />
      ))}
    </g>
  )
}

// ─── Ground ──────────────────────────────────────────────────────────────────
function Ground({ season }) {
  const grassColour = season === 'winter' ? '#9aab8a' : season === 'autumn' ? '#8b7355' : '#7a9e5a'
  return (
    <g>
      <ellipse cx="150" cy="302" rx="130" ry="8" fill={grassColour} opacity="0.35" />
      <line x1="20" y1="300" x2="280" y2="300" stroke={grassColour} strokeWidth="1.5" opacity="0.5" />
    </g>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────
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
  const tc = trunkColour(phys)
  const lc = leafColour(resolvedSeason, emo) || '#888'

  const treeProps = { tc, lc, phys, soc, emo, season: resolvedSeason }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <style>{`
        @keyframes canopy-sway {
          0%,100% { transform-origin: center 300px; transform: rotate(0deg); }
          50%      { transform-origin: center 300px; transform: rotate(0.6deg); }
        }
        .oak-canopy { animation: canopy-sway 6s ease-in-out infinite; }
      `}</style>

      <svg viewBox="0 0 300 360" width="100%" style={{ maxWidth: 280 }} aria-label={`Oak tree — ${STAGE_NAMES[stage]}`}>
        {/* Sky background — subtle */}
        <defs>
          <radialGradient id="sky-grad" cx="50%" cy="80%" r="60%">
            <stop offset="0%" stopColor={resolvedSeason === 'winter' ? '#e8edf2' : resolvedSeason === 'autumn' ? '#f5ede0' : '#eef5e8'} />
            <stop offset="100%" stopColor={resolvedSeason === 'winter' ? '#d4dce6' : resolvedSeason === 'autumn' ? '#ede0cc' : '#e5f0db'} />
          </radialGradient>
        </defs>
        <rect x="0" y="0" width="300" height="360" fill="url(#sky-grad)" rx="16" />

        <Ground season={resolvedSeason} />

        {stage === 1 && <Acorn />}
        {stage === 2 && <Seedling lc={lc} />}
        {stage === 3 && <Sapling {...treeProps} />}
        {stage === 4 && <YoungOak {...treeProps} />}
        {stage === 5 && <EstablishedOak {...treeProps} />}
        {stage === 6 && <MatureOak {...treeProps} />}
        {stage === 7 && <AncientOak {...treeProps} />}

        {resolvedSeason === 'autumn' && stage >= 4 && (
          <FallingLeaves lc={lc} count={Math.max(2, Math.round(soc / 20))} />
        )}
      </svg>

      {/* Stage label */}
      <span style={{ fontSize: 12, color: '#9ca3af', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {STAGE_NAMES[stage]}
      </span>

      {/* Score arcs */}
      <svg viewBox="0 0 120 36" width="120" style={{ overflow: 'visible' }}>
        <ScoreArc cx={20}  cy={18} r={14} score={phys} colour="#0d9488" label="Physical" />
        <ScoreArc cx={60}  cy={18} r={14} score={soc}  colour="#d97706" label="Social" />
        <ScoreArc cx={100} cy={18} r={14} score={emo}  colour="#3b82f6" label="Emotional" />
        {/* labels */}
        <text x={20}  y={34} textAnchor="middle" fontSize="6" fill="#9ca3af">Phys</text>
        <text x={60}  y={34} textAnchor="middle" fontSize="6" fill="#9ca3af">Social</text>
        <text x={100} y={34} textAnchor="middle" fontSize="6" fill="#9ca3af">Emo</text>
      </svg>
    </div>
  )
}
