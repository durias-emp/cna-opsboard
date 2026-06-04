import { useState, useMemo } from 'react'

// ── Aircraft constants ─────────────────────────────────────────────────────────

const BEW_WEIGHT    = 1976.0
const BEW_LONG_ARM  = 115.96
const BEW_LAT_ARM   = 0.14
const MAX_TOW       = 3200
const FUEL_LB_GAL   = 6.7
const FUEL_LONG_ARM = 110.60
const FUEL_LAT_ARM  = 0.0
const EXT_MAX_WT    = 42

const STATIONS = [
  { id: 'pilot',    label: 'Pilot',           sub: 'Front Right', longArm: 65.0,  latArm:  14.0  },
  { id: 'pax1',     label: 'Front Left Pax',  sub: 'Front Left',  longArm: 65.0,  latArm: -11.0  },
  { id: 'pax2',     label: 'Rear Right Pax',  sub: 'Rear Right',  longArm: 104.0, latArm:  16.10 },
  { id: 'pax3',     label: 'Rear Center Pax', sub: 'Rear Center', longArm: 104.0, latArm:  0.0   },
  { id: 'pax4',     label: 'Rear Left Pax',   sub: 'Rear Left',   longArm: 104.0, latArm: -16.10 },
  { id: 'baggage',  label: 'Baggage',         sub: 'Compartment', longArm: 148.0, latArm:  0.0   },
  { id: 'extender', label: 'Ext. Baggage',    sub: `Max ${EXT_MAX_WT} lbs`, longArm: 185.0, latArm: 0.0, maxWeight: EXT_MAX_WT },
]

const DOORS = {
  frontLeft:  { label: 'Fwd Left',  weight: 11, longArm: 66.0,  latArm: -25.0 },
  frontRight: { label: 'Fwd Right', weight: 11, longArm: 66.0,  latArm:  25.0 },
  rearLeft:   { label: 'Aft Left',  weight: 15, longArm: 100.0, latArm: -25.0 },
  rearRight:  { label: 'Aft Right', weight: 15, longArm: 100.0, latArm:  25.0 },
}

// ── CG limits ─────────────────────────────────────────────────────────────────

const LAT_L_LIMIT = -3.0   // BHT-206B3-FM-1 Figure 1-2 main body limit
const LAT_R_LIMIT =  4.0   // BHT-206B3-FM-1 Figure 1-2 main body limit

function longFwdLimit(anyFrontDoorOff) { return anyFrontDoorOff ? 111.6 : 106.0 }
function longAftLimit(w) {
  if (w <= 2425) return 114.2
  if (w >= 3200) return 111.6
  return 114.2 - (w - 2425) * 2.6 / 775
}

// ── Unit helpers ──────────────────────────────────────────────────────────────

const LBS_TO_KG = 0.453592
const IN_TO_CM  = 2.54

function toDisplay(val, type, metric) {
  if (val == null || isNaN(val) || !isFinite(val)) return '—'
  if (!metric) return val.toFixed(type === 'arm' || type === 'cg' ? 2 : 1)
  if (type === 'weight') return (val * LBS_TO_KG).toFixed(1)
  if (type === 'arm' || type === 'cg') return (val * IN_TO_CM).toFixed(2)
  if (type === 'moment') return (val * LBS_TO_KG * IN_TO_CM).toFixed(0)
  return val.toFixed(2)
}

function unitLabel(type, metric) {
  if (metric) return { weight: 'kg', arm: 'cm', cg: 'cm', moment: 'kg·cm' }[type] ?? ''
  return { weight: 'lbs', arm: 'in', cg: 'in', moment: 'in·lb' }[type] ?? ''
}

// ── W&B Calculation ────────────────────────────────────────────────────────────

function calculate(weights, doors) {
  // Start from BEW, subtract removed doors
  let adjW   = BEW_WEIGHT
  let adjLM  = BEW_WEIGHT * BEW_LONG_ARM
  let adjLaM = BEW_WEIGHT * BEW_LAT_ARM

  const removedDoors = []
  Object.entries(doors).forEach(([key, isOn]) => {
    if (!isOn) {
      const d = DOORS[key]
      adjW   -= d.weight
      adjLM  -= d.weight * d.longArm
      adjLaM -= d.weight * d.latArm
      removedDoors.push({ label: d.label, weight: -d.weight, longArm: d.longArm, latArm: d.latArm, longMom: -(d.weight * d.longArm), latMom: -(d.weight * d.latArm) })
    }
  })

  // Payload items
  const items = []
  let zfW = adjW, zfLM = adjLM, zfLaM = adjLaM

  STATIONS.forEach(s => {
    const w = parseFloat(weights[s.id]) || 0
    if (w === 0) return
    const lm  = w * s.longArm
    const lam = w * s.latArm
    items.push({ label: s.label, sub: s.sub, weight: w, longArm: s.longArm, latArm: s.latArm, longMom: lm, latMom: lam })
    zfW   += w;  zfLM  += lm;  zfLaM += lam
  })

  const zfLongCG = zfW > 0 ? zfLM  / zfW : NaN
  const zfLatCG  = zfW > 0 ? zfLaM / zfW : NaN

  // Fuel
  const fuelGal = parseFloat(weights.fuel) || 0
  const fuelLbs = fuelGal * FUEL_LB_GAL
  const fuelLM  = fuelLbs * FUEL_LONG_ARM
  const fuelLaM = fuelLbs * FUEL_LAT_ARM

  const auW   = zfW  + fuelLbs
  const auLM  = zfLM + fuelLM
  const auLaM = zfLaM + fuelLaM
  const auLongCG = auW > 0 ? auLM  / auW : NaN
  const auLatCG  = auW > 0 ? auLaM / auW : NaN

  const frontDoorsOff = !doors.frontLeft || !doors.frontRight
  const fwdLim = longFwdLimit(frontDoorsOff)

  const hasData = items.length > 0 || fuelLbs > 0

  return {
    adjBEW:  { weight: adjW,   longArm: BEW_LONG_ARM, latArm: BEW_LAT_ARM, longMom: adjLM,  latMom: adjLaM  },
    removedDoors,
    items,
    fuel: fuelLbs > 0 ? { label: `Fuel (${fuelGal} USG)`, weight: fuelLbs, longArm: FUEL_LONG_ARM, latArm: FUEL_LAT_ARM, longMom: fuelLM, latMom: fuelLaM } : null,
    zeroFuel: { weight: zfW,  longCG: zfLongCG, latCG: zfLatCG,  longMom: zfLM,  latMom: zfLaM  },
    allUp:    { weight: auW,  longCG: auLongCG, latCG: auLatCG,   longMom: auLM,  latMom: auLaM  },
    limits: { fwdLim, frontDoorsOff, zfAft: longAftLimit(zfW), auAft: longAftLimit(auW) },
    status: {
      hasData,
      overweight:  auW > MAX_TOW,
      zfLongOK:    isFinite(zfLongCG) && zfLongCG >= fwdLim && zfLongCG <= longAftLimit(zfW),
      zfLatOK:     isFinite(zfLatCG)  && zfLatCG  >= LAT_L_LIMIT && zfLatCG <= LAT_R_LIMIT,
      auLongOK:    isFinite(auLongCG) && auLongCG >= fwdLim && auLongCG <= longAftLimit(auW),
      auLatOK:     isFinite(auLatCG)  && auLatCG  >= LAT_L_LIMIT && auLatCG <= LAT_R_LIMIT,
    }
  }
}

// ── Longitudinal CG chart ─────────────────────────────────────────────────────

function LongCGChart({ result }) {
  const VW = 320, VH = 210
  const P = { t: 14, r: 18, b: 32, l: 46 }
  const CW = VW - P.l - P.r
  const CH = VH - P.t - P.b

  const CG_MIN = 105.0, CG_MAX = 115.0
  const WT_MIN = 1800,  WT_MAX = 3400

  const px = cg => P.l + (cg - CG_MIN) / (CG_MAX - CG_MIN) * CW
  const py = w  => P.t + CH * (1 - (w - WT_MIN) / (WT_MAX - WT_MIN))

  const { limits, zeroFuel, allUp, status } = result
  const { fwdLim } = limits

  // Envelope polygon
  const envPts = [
    [fwdLim, WT_MIN],
    [fwdLim, MAX_TOW],
    [longAftLimit(MAX_TOW), MAX_TOW],
    [114.2, 2425],
    [114.2, WT_MIN],
  ].map(([cg, w]) => `${px(cg).toFixed(1)},${py(w).toFixed(1)}`).join(' ')

  const cgTicks = [106, 107, 108, 109, 110, 111, 112, 113, 114]
  const wtTicks = [2000, 2200, 2400, 2600, 2800, 3000, 3200]

  const zfOK = status.zfLongOK
  const auOK = status.auLongOK
  const hasZF = isFinite(zeroFuel.longCG) && zeroFuel.weight > 0
  const hasAU = isFinite(allUp.longCG)    && allUp.weight    > 0

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full">
      {/* Grid */}
      {cgTicks.map(cg => (
        <line key={cg} x1={px(cg).toFixed(1)} y1={P.t} x2={px(cg).toFixed(1)} y2={P.t + CH}
          stroke="rgba(255,255,255,0.07)" strokeWidth={0.8} />
      ))}
      {wtTicks.map(w => (
        <line key={w} x1={P.l} y1={py(w).toFixed(1)} x2={P.l + CW} y2={py(w).toFixed(1)}
          stroke="rgba(255,255,255,0.07)" strokeWidth={0.8} />
      ))}

      {/* Envelope */}
      <polygon points={envPts} fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.55)" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Max TOW line */}
      <line x1={P.l} y1={py(MAX_TOW).toFixed(1)} x2={P.l + CW} y2={py(MAX_TOW).toFixed(1)}
        stroke="rgba(239,68,68,0.4)" strokeWidth={1} strokeDasharray="4,3" />
      <text x={P.l + CW - 2} y={py(MAX_TOW) - 3} textAnchor="end" fontSize={6.5} fill="rgba(239,68,68,0.6)">MAX TOW</text>

      {/* Axes */}
      <line x1={P.l} y1={P.t} x2={P.l} y2={P.t + CH + 1} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <line x1={P.l - 1} y1={P.t + CH} x2={P.l + CW} y2={P.t + CH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />

      {/* CG axis labels — every 2" */}
      {cgTicks.filter(cg => cg % 2 === 0).map(cg => (
        <text key={cg} x={px(cg).toFixed(1)} y={P.t + CH + 11} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.35)">{cg}</text>
      ))}

      {/* Weight axis labels */}
      {wtTicks.filter(w => w % 400 === 0).map(w => (
        <text key={w} x={P.l - 5} y={(py(w) + 3).toFixed(1)} textAnchor="end" fontSize={6.5} fill="rgba(255,255,255,0.35)">{w}</text>
      ))}

      {/* Axis titles */}
      <text x={P.l + CW / 2} y={VH - 2} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.4)">Longitudinal CG (in)</text>
      <text x={9} y={P.t + CH / 2} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.4)"
        transform={`rotate(-90,9,${(P.t + CH / 2).toFixed(1)})`}>Weight (lbs)</text>

      {/* Travel line */}
      {hasZF && hasAU && (
        <line x1={px(zeroFuel.longCG).toFixed(1)} y1={py(zeroFuel.weight).toFixed(1)}
              x2={px(allUp.longCG).toFixed(1)}    y2={py(allUp.weight).toFixed(1)}
          stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,2" />
      )}

      {/* Zero Fuel point */}
      {hasZF && (
        <g>
          <circle cx={px(zeroFuel.longCG).toFixed(1)} cy={py(zeroFuel.weight).toFixed(1)} r={5}
            fill={zfOK ? '#60a5fa' : '#ef4444'} stroke="#000" strokeWidth={0.8} />
          <text x={(px(zeroFuel.longCG) + 8).toFixed(1)} y={(py(zeroFuel.weight) + 3).toFixed(1)}
            fontSize={7} fill="rgba(255,255,255,0.55)">ZF</text>
        </g>
      )}

      {/* All Up point */}
      {hasAU && (
        <g>
          <circle cx={px(allUp.longCG).toFixed(1)} cy={py(allUp.weight).toFixed(1)} r={5}
            fill={auOK ? '#a78bfa' : '#ef4444'} stroke="#000" strokeWidth={0.8} />
          <text x={(px(allUp.longCG) + 8).toFixed(1)} y={(py(allUp.weight) + 3).toFixed(1)}
            fontSize={7} fill="rgba(255,255,255,0.55)">AU</text>
        </g>
      )}
    </svg>
  )
}

// ── Lateral CG chart ──────────────────────────────────────────────────────────
// Matches iBal: Y = Long CG (Fwd at top), X = Lat CG (L left, R right)

function LatCGChart({ result }) {
  const VW = 320, VH = 290
  const P = { t: 22, r: 24, b: 28, l: 46 }
  const CW = VW - P.l - P.r
  const CH = VH - P.t - P.b

  // Y: Long CG — Fwd (small) at top, Aft (large) at bottom
  const LONG_MIN = 105.0, LONG_MAX = 115.0
  // X: Lat CG — same range as iBal (-4 to +5)
  const LAT_CHART_MIN = -4.0, LAT_CHART_MAX = 5.0

  const py = longCG => P.t + (longCG - LONG_MIN) / (LONG_MAX - LONG_MIN) * CH
  const px = latCG  => P.l + (latCG  - LAT_CHART_MIN) / (LAT_CHART_MAX - LAT_CHART_MIN) * CW

  const { zeroFuel, allUp, status } = result
  const hasZF = isFinite(zeroFuel.longCG) && zeroFuel.weight > 0
  const hasAU = isFinite(allUp.longCG)    && allUp.weight    > 0

  // Lateral envelope — BHT-206B3-FM-1 Figure 1-2 exact coordinates
  // Main body (108"–114.2"): -3.0" to +4.0"
  // Left cut: -3.0" at 108" → -2.3" at 106"
  // Right cut: +4.0" at 108" → +3.0" at 106"
  const LAT_AFT = 114.2
  const envPts = [
    [-2.3,         106.0   ],   // Fwd left  — cut ends at -2.3" (per FM label)
    [ 3.0,         106.0   ],   // Fwd right — cut ends at +3.0"
    [ LAT_R_LIMIT, 108.0   ],   // Right: opens to +4.0" at 108"
    [ LAT_R_LIMIT, LAT_AFT ],   // Aft right — 114.2"
    [ LAT_L_LIMIT, LAT_AFT ],   // Aft left  — 114.2"
    [ LAT_L_LIMIT, 108.0   ],   // Left: opens to -3.0" at 108"
  ].map(([lat, longCG]) => `${px(lat).toFixed(1)},${py(longCG).toFixed(1)}`).join(' ')

  const longTicks = [106, 107, 108, 109, 110, 111, 112, 113, 114]
  const latTicks  = [-3, -2, -1, 0, 1, 2, 3, 4]

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full">
      {/* Grid */}
      {longTicks.map(v => (
        <line key={v} x1={P.l} y1={py(v).toFixed(1)} x2={P.l + CW} y2={py(v).toFixed(1)}
          stroke="rgba(255,255,255,0.07)" strokeWidth={0.8} />
      ))}
      {latTicks.map(v => (
        <line key={v} x1={px(v).toFixed(1)} y1={P.t} x2={px(v).toFixed(1)} y2={P.t + CH}
          stroke="rgba(255,255,255,0.07)" strokeWidth={0.8} />
      ))}

      {/* Centreline (lateral = 0) */}
      <line x1={px(0).toFixed(1)} y1={P.t} x2={px(0).toFixed(1)} y2={P.t + CH}
        stroke="rgba(255,255,255,0.12)" strokeWidth={0.8} strokeDasharray="4,3" />

      {/* Envelope */}
      <polygon points={envPts} fill="rgba(34,197,94,0.1)" stroke="rgba(34,197,94,0.55)" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Axes */}
      <line x1={P.l} y1={P.t} x2={P.l} y2={P.t + CH + 1} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
      <line x1={P.l - 1} y1={P.t + CH} x2={P.l + CW} y2={P.t + CH} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />

      {/* Long CG axis labels (left) — every 2" */}
      {longTicks.filter(v => v % 2 === 0).map(v => (
        <text key={v} x={P.l - 4} y={(py(v) + 2.5).toFixed(1)} textAnchor="end" fontSize={6.5} fill="rgba(255,255,255,0.35)">{v}</text>
      ))}

      {/* Lat CG axis labels (bottom) */}
      {latTicks.map(v => (
        <text key={v} x={px(v).toFixed(1)} y={P.t + CH + 10} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.35)">{v}</text>
      ))}

      {/* Axis titles */}
      <text x={P.l + CW / 2} y={VH - 2} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.4)">Lateral CG (in)</text>
      <text x={9} y={P.t + CH / 2} textAnchor="middle" fontSize={7} fill="rgba(255,255,255,0.4)"
        transform={`rotate(-90,9,${(P.t + CH / 2).toFixed(1)})`}>Long CG (in)</text>

      {/* Fwd / Aft / L / R directional labels */}
      <text x={P.l + CW / 2} y={py(106.0) - 5} textAnchor="middle" fontSize={8} fontWeight="600" fill="rgba(255,255,255,0.2)">Fwd</text>
      <text x={P.l + CW / 2} y={py(LAT_AFT) + 13} textAnchor="middle" fontSize={8} fontWeight="600" fill="rgba(255,255,255,0.2)">Aft</text>
      <text x={px(-2.8)} y={P.t + CH / 2 + 4} textAnchor="middle" fontSize={11} fontWeight="700" fill="rgba(255,255,255,0.12)">L</text>
      <text x={px(3.8)}  y={P.t + CH / 2 + 4} textAnchor="middle" fontSize={11} fontWeight="700" fill="rgba(255,255,255,0.12)">R</text>

      {/* Travel line */}
      {hasZF && hasAU && (
        <line x1={px(zeroFuel.latCG).toFixed(1)} y1={py(zeroFuel.longCG).toFixed(1)}
              x2={px(allUp.latCG).toFixed(1)}    y2={py(allUp.longCG).toFixed(1)}
          stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,2" />
      )}

      {/* Zero Fuel point */}
      {hasZF && (
        <g>
          <circle cx={px(zeroFuel.latCG).toFixed(1)} cy={py(zeroFuel.longCG).toFixed(1)} r={5}
            fill={status.zfLatOK && status.zfLongOK ? '#60a5fa' : '#ef4444'} stroke="#000" strokeWidth={0.8} />
          <text x={(px(zeroFuel.latCG) + 8).toFixed(1)} y={(py(zeroFuel.longCG) + 3).toFixed(1)}
            fontSize={7} fill="rgba(255,255,255,0.55)">ZF</text>
        </g>
      )}

      {/* All Up point */}
      {hasAU && (
        <g>
          <circle cx={px(allUp.latCG).toFixed(1)} cy={py(allUp.longCG).toFixed(1)} r={5}
            fill={status.auLatOK && status.auLongOK ? '#a78bfa' : '#ef4444'} stroke="#000" strokeWidth={0.8} />
          <text x={(px(allUp.latCG) + 8).toFixed(1)} y={(py(allUp.longCG) + 3).toFixed(1)}
            fontSize={7} fill="rgba(255,255,255,0.55)">AU</text>
        </g>
      )}
    </svg>
  )
}

// ── Main Calculator ────────────────────────────────────────────────────────────

export default function WeightBalanceCalculator({ onClose }) {
  const [metric, setMetric] = useState(false)
  const [doors,  setDoors]  = useState({ frontLeft: true, frontRight: true, rearLeft: true, rearRight: true })
  const [weights, setWeights] = useState({
    pilot: '', pax1: '', pax2: '', pax3: '', pax4: '',
    baggage: '', extender: '', fuel: '',
  })

  function setW(id, val) { setWeights(p => ({ ...p, [id]: val })) }
  function toggleDoor(key) { setDoors(p => ({ ...p, [key]: !p[key] })) }

  const result = useMemo(() => calculate(weights, doors), [weights, doors])
  const { status, zeroFuel, allUp, limits } = result

  const overallOK = !status.overweight && status.zfLongOK && status.zfLatOK && status.auLongOK && status.auLatOK

  const wU = unitLabel('weight', metric)
  const aU = unitLabel('arm', metric)

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-hidden"
         style={{ background: '#0a0a0c' }}>

      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 pb-3 border-b border-white/[0.06]"
           style={{ paddingTop: 'calc(1rem + env(safe-area-inset-top))' }}>
        <button onClick={onClose}
          className="flex items-center gap-1.5 text-white/50 active:text-white/80 transition-colors">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
            strokeLinecap="round" className="w-4 h-4">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="text-sm">Back</span>
        </button>
        <h1 className="text-sm font-bold text-white">Weight & Balance</h1>
        {/* Unit toggle */}
        <button onClick={() => setMetric(m => !m)}
          className="px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-colors"
          style={{
            background: metric ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.06)',
            color: metric ? '#818cf8' : 'rgba(255,255,255,0.4)',
            borderColor: metric ? 'rgba(99,102,241,0.3)' : 'rgba(255,255,255,0.08)',
          }}>
          {metric ? 'kg · cm' : 'lbs · in'}
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-5 pb-10">

          {/* Aircraft info */}
          <div className="rounded-xl px-4 py-3 flex items-center justify-between"
               style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <p className="text-xs font-bold text-white">Bell 206B3 JetRanger</p>
              <p className="text-[10px] text-white/35 mt-0.5">YS-CNA · BEW {toDisplay(BEW_WEIGHT, 'weight', metric)} {wU} · Max TOW {toDisplay(MAX_TOW, 'weight', metric)} {wU}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-white/35">BEW Long CG</p>
              <p className="text-xs font-semibold text-white/60">{toDisplay(BEW_LONG_ARM, 'arm', metric)} {aU}</p>
            </div>
          </div>

          {/* Doors */}
          <div>
            <p className="label mb-2">Door Configuration</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'frontLeft',  label: 'Fwd Left',  pos: '↖' },
                { key: 'frontRight', label: 'Fwd Right', pos: '↗' },
                { key: 'rearLeft',   label: 'Aft Left',  pos: '↙' },
                { key: 'rearRight',  label: 'Aft Right', pos: '↘' },
              ].map(({ key, label, pos }) => {
                const on = doors[key]
                return (
                  <button key={key} onClick={() => toggleDoor(key)}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 transition-all active:scale-[0.97]"
                    style={{
                      background: on ? 'rgba(255,255,255,0.07)' : 'rgba(239,68,68,0.08)',
                      border: `1px solid ${on ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.25)'}`,
                    }}>
                    <span className="text-xs font-semibold" style={{ color: on ? 'rgba(255,255,255,0.7)' : '#f87171' }}>
                      {pos} {label}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: on ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: on ? '#4ade80' : '#f87171' }}>
                      {on ? 'ON' : 'OFF'}
                    </span>
                  </button>
                )
              })}
            </div>
            {limits.frontDoorsOff && (
              <p className="text-[10px] text-amber-400/70 mt-1.5 ml-1">
                ⚠ Forward door(s) off — Fwd CG limit changes to 111.6 in
              </p>
            )}
          </div>

          {/* Occupants */}
          <div>
            <p className="label mb-2">Occupants & Payload</p>
            <div className="space-y-2">
              {STATIONS.map(s => (
                <div key={s.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-white/70">{s.label}</p>
                    <p className="text-[10px] text-white/30">{s.sub}{s.maxWeight ? ` · max ${s.maxWeight} lbs` : ''}</p>
                  </div>
                  <div className="relative w-28">
                    <input
                      type="number" inputMode="decimal" min={0}
                      max={s.maxWeight || undefined}
                      placeholder="0"
                      value={weights[s.id]}
                      onChange={e => setW(s.id, e.target.value)}
                      className="input-field w-full text-sm text-right pr-9"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">
                      {metric ? 'kg' : 'lbs'}
                    </span>
                  </div>
                </div>
              ))}

              {/* Fuel */}
              <div className="flex items-center gap-2 pt-1 border-t border-white/[0.05]">
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white/70">Fuel</p>
                  <p className="text-[10px] text-white/30">Main tank · {FUEL_LB_GAL} lbs/USG</p>
                </div>
                <div className="relative w-28">
                  <input
                    type="number" inputMode="decimal" min={0} max={75}
                    placeholder="0"
                    value={weights.fuel}
                    onChange={e => setW('fuel', e.target.value)}
                    className="input-field w-full text-sm text-right pr-10"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">
                    USG
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Results ── */}
          {result.status.hasData && (
            <>
              {/* W&B Table */}
              <div>
                <p className="label mb-2">Weight & Moment Summary</p>
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid rgba(255,255,255,0.07)' }}>
                  {/* Table header */}
                  <div className="grid grid-cols-[1fr_60px_60px_60px] gap-0 px-3 py-1.5"
                       style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider">Item</p>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider text-right">{wU}</p>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider text-right">L.Arm {aU}</p>
                    <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider text-right">Lat {aU}</p>
                  </div>

                  {/* BEW row */}
                  <TableRow label="Basic Empty Wt" sub={`Long CG ${toDisplay(BEW_LONG_ARM,'arm',metric)} ${aU}`}
                    weight={toDisplay(result.adjBEW.weight,'weight',metric)}
                    longArm={toDisplay(BEW_LONG_ARM,'arm',metric)}
                    latArm={toDisplay(BEW_LAT_ARM,'arm',metric)} highlight />

                  {/* Removed doors */}
                  {result.removedDoors.map(d => (
                    <TableRow key={d.label} label={`− ${d.label} (removed)`} sub="Door off"
                      weight={toDisplay(d.weight,'weight',metric)}
                      longArm={toDisplay(d.longArm,'arm',metric)}
                      latArm={toDisplay(d.latArm,'arm',metric)} dim />
                  ))}

                  {/* Payload items */}
                  {result.items.map(item => (
                    <TableRow key={item.label} label={item.label} sub={item.sub}
                      weight={toDisplay(item.weight,'weight',metric)}
                      longArm={toDisplay(item.longArm,'arm',metric)}
                      latArm={toDisplay(item.latArm,'arm',metric)} />
                  ))}

                  {/* Zero fuel total */}
                  <SummaryRow label="Zero Fuel Weight"
                    weight={toDisplay(zeroFuel.weight,'weight',metric)}
                    longCG={toDisplay(zeroFuel.longCG,'cg',metric)}
                    latCG={toDisplay(zeroFuel.latCG,'cg',metric)}
                    longOK={status.zfLongOK} latOK={status.zfLatOK}
                    unit={{ w: wU, a: aU }} />

                  {/* Fuel row */}
                  {result.fuel && (
                    <TableRow label={result.fuel.label} sub="Main tank"
                      weight={toDisplay(result.fuel.weight,'weight',metric)}
                      longArm={toDisplay(result.fuel.longArm,'arm',metric)}
                      latArm={toDisplay(result.fuel.latArm,'arm',metric)} />
                  )}

                  {/* All up total */}
                  <SummaryRow label="All Up Weight" isAllUp
                    weight={toDisplay(allUp.weight,'weight',metric)}
                    longCG={toDisplay(allUp.longCG,'cg',metric)}
                    latCG={toDisplay(allUp.latCG,'cg',metric)}
                    longOK={status.auLongOK} latOK={status.auLatOK}
                    overweight={status.overweight}
                    unit={{ w: wU, a: aU }} />
                </div>
              </div>

              {/* Overall status */}
              <div className="rounded-xl px-4 py-3 flex items-center gap-3"
                   style={{
                     background: overallOK ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                     border: `1px solid ${overallOK ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.25)'}`,
                   }}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${overallOK ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                  {overallOK
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth={2.5} strokeLinecap="round" className="w-4 h-4"><path d="M20 6L9 17l-5-5" /></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth={2.5} strokeLinecap="round" className="w-4 h-4"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                  }
                </div>
                <div>
                  <p className="text-sm font-bold" style={{ color: overallOK ? '#4ade80' : '#f87171' }}>
                    {overallOK ? 'Weight & Balance OK' : 'Out of Limits'}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: overallOK ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,113,0.6)' }}>
                    {status.overweight
                      ? `Overweight by ${toDisplay(allUp.weight - MAX_TOW,'weight',metric)} ${wU}`
                      : overallOK
                        ? 'CG within all limits for current configuration'
                        : 'Review CG — check charts below'
                    }
                  </p>
                </div>
              </div>

              {/* Charts */}
              <div>
                <p className="label mb-2">CG Envelope — Longitudinal</p>
                <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <LongCGChart result={result} />
                  <div className="flex items-center gap-4 mt-2 px-1">
                    <Legend color="#60a5fa" label="Zero Fuel" />
                    <Legend color="#a78bfa" label="All Up" />
                    <Legend color="rgba(34,197,94,0.6)" label="Envelope" isRect />
                  </div>
                </div>
              </div>

              <div>
                <p className="label mb-2">CG Envelope — Lateral vs Longitudinal</p>
                <div className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <LatCGChart result={result} />
                  <div className="flex items-center gap-4 mt-2 px-1">
                    <Legend color="#60a5fa" label="Zero Fuel" />
                    <Legend color="#a78bfa" label="All Up" />
                    <Legend color="rgba(34,197,94,0.6)" label="Envelope" isRect />
                  </div>
                </div>
              </div>

              <p className="text-[9px] text-white/20 text-center pb-2">
                FAA-approved limits per BHT-206B3-FM-1 · For planning purposes only · PIC is responsible for W&B verification
              </p>
            </>
          )}

          {!result.status.hasData && (
            <div className="rounded-xl px-4 py-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-white/25 text-sm">Enter weights above to calculate</p>
              <p className="text-white/15 text-xs mt-1">Graphs will appear here</p>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TableRow({ label, sub, weight, longArm, latArm, highlight, dim }) {
  return (
    <div className="grid grid-cols-[1fr_60px_60px_60px] gap-0 px-3 py-2"
         style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: dim ? 0.5 : 1, background: highlight ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
      <div>
        <p className="text-[11px] font-semibold" style={{ color: highlight ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.55)' }}>{label}</p>
        {sub && <p className="text-[9px] text-white/25">{sub}</p>}
      </div>
      <p className="text-[11px] text-right self-center" style={{ color: 'rgba(255,255,255,0.6)' }}>{weight}</p>
      <p className="text-[11px] text-right self-center text-white/40">{longArm}</p>
      <p className="text-[11px] text-right self-center text-white/40">{latArm}</p>
    </div>
  )
}

function SummaryRow({ label, weight, longCG, latCG, longOK, latOK, overweight, isAllUp, unit }) {
  const cgOK = longOK && latOK && !overweight
  return (
    <div className="px-3 py-2.5" style={{ background: isAllUp ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[11px] font-bold text-white">{label}</p>
        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: cgOK ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: cgOK ? '#4ade80' : '#f87171' }}>
          {cgOK ? 'OK' : overweight ? 'OVERWEIGHT' : 'OUT OF LIMITS'}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[9px] text-white/30">Weight</p>
          <p className="text-xs font-bold text-white">{weight} <span className="text-[9px] font-normal text-white/40">{unit.w}</span></p>
        </div>
        <div>
          <p className="text-[9px] text-white/30">Long CG</p>
          <p className="text-xs font-bold" style={{ color: longOK ? 'rgba(255,255,255,0.9)' : '#f87171' }}>
            {longCG} <span className="text-[9px] font-normal text-white/40">{unit.a}</span>
          </p>
        </div>
        <div>
          <p className="text-[9px] text-white/30">Lat CG</p>
          <p className="text-xs font-bold" style={{ color: latOK ? 'rgba(255,255,255,0.9)' : '#f87171' }}>
            {latCG} <span className="text-[9px] font-normal text-white/40">{unit.a}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

function Legend({ color, label, isRect }) {
  return (
    <div className="flex items-center gap-1.5">
      {isRect
        ? <div className="w-3 h-2 rounded-sm" style={{ background: color }} />
        : <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      }
      <span className="text-[9px] text-white/35">{label}</span>
    </div>
  )
}
