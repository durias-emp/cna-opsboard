import { useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import { useTank, TANK_MAX_GAL, SUPPLIERS } from '../hooks/useTank'
import { useJerryCans } from '../hooks/useJerryCans'
import PageHeader from '../components/PageHeader'
import SectionHeader from '../components/SectionHeader'
import TankFillupDrawer from '../components/TankFillupDrawer'

const TOTAL_FACILITY_CAPACITY = 181 // 140 tank + 41 jerry cans

// ── Icons ──────────────────────────────────────────────────────────────────────

const IconDrop = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
)
const IconFillup = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <rect x="3" y="3" width="11" height="18" rx="2" />
    <rect x="5" y="5" width="7" height="5" rx="1" />
    <line x1="2" y1="21" x2="15" y2="21" />
    <path d="M14 8h2a2 2 0 0 1 2 2v7a2 2 0 0 0 2 2" />
    <line x1="14" y1="5" x2="17" y2="3" />
  </svg>
)
const IconDollar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Tank Gauge ─────────────────────────────────────────────────────────────────

function TankGauge({ currentLevel, fillPercent, last, onAdd, onWithdraw }) {
  const r    = 52
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - (fillPercent ?? 0))

  const isEmpty  = currentLevel === null
  const isLow    = !isEmpty && fillPercent < 0.25
  const isMedium = !isEmpty && fillPercent >= 0.25 && fillPercent < 0.6

  const ringColor = isEmpty  ? 'rgba(255,255,255,0.08)'
    : isLow   ? 'rgba(255,255,255,0.9)'
    : isMedium ? 'rgba(255,255,255,0.6)'
    : 'rgba(255,255,255,0.35)'

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="label">Facility tank</p>
          <p className="text-xs text-white/40 mt-0.5">Max {TANK_MAX_GAL} gal · US Gallons</p>
        </div>
        <div className="flex items-center gap-2">
          {isLow && currentLevel !== null && (
            <span className="badge bg-white text-black text-[10px] animate-pulse">Low</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Ring gauge */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={r} fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
            <circle cx="60" cy="60" r={r} fill="none"
              stroke={ringColor}
              strokeWidth="10"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-white leading-none">
              {currentLevel != null ? currentLevel : '—'}
            </p>
            <p className="text-[10px] text-white/35 mt-0.5">of {TANK_MAX_GAL} gal</p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="label mb-1">Level</p>
            <p className="text-xl font-bold text-white">
              {currentLevel != null
                ? `${Math.round(fillPercent * 100)}%`
                : '—'}
            </p>
          </div>
          <div>
            <p className="label mb-1">Capacity left</p>
            <p className="text-sm font-semibold text-white">
              {currentLevel != null
                ? `${(TANK_MAX_GAL - currentLevel).toFixed(1)} gal`
                : '—'}
            </p>
          </div>
          {last && (
            <div>
              <p className="label mb-1">Last fill-up</p>
              <p className="text-xs text-white/60">{formatDate(last.date)}</p>
            </div>
          )}
        </div>
      </div>


      {/* Action buttons */}
      <div className="flex gap-2 mt-4 pt-4 border-t border-white/[0.05]">
        <button
          onClick={onWithdraw}
          className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-medium
                     text-white/50 flex items-center justify-center gap-1.5
                     active:bg-white/5 transition-colors select-none"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" className="w-3.5 h-3.5">
            <path d="M12 5v14M5 12h14" transform="rotate(180 12 12)" />
            <line x1="5" y1="19" x2="19" y2="19" />
          </svg>
          Withdraw
        </button>
        <button
          onClick={onAdd}
          className="flex-1 py-2.5 rounded-xl border border-white/10 text-xs font-medium
                     text-white/50 flex items-center justify-center gap-1.5
                     active:bg-white/5 transition-colors select-none"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" className="w-3.5 h-3.5">
            <path d="M12 5v14M5 12h14" />
          </svg>
          Fill-up
        </button>
      </div>
    </div>
  )
}

// ── Cost Chart ─────────────────────────────────────────────────────────────────

function CostChart({ chartData }) {
  if (chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2">
        <p className="text-xs text-white/25">No fill-ups logged yet</p>
      </div>
    )
  }

  const maxCost = Math.max(...chartData.map(d => d.totalCost), 1)

  return (
    <div className="space-y-3">
      {/* Bar chart */}
      <div className="flex items-end gap-2 h-24">
        {chartData.map((d, i) => {
          const isLatest = i === chartData.length - 1
          const heightPct = Math.max((d.totalCost / maxCost) * 100, 6)
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
              <span className="text-[9px] text-white/30">${d.totalCost?.toFixed(0)}</span>
              <div className="w-full flex items-end" style={{ height: '72px' }}>
                <div
                  style={{ height: `${heightPct}%` }}
                  className={`w-full rounded-t transition-all
                    ${isLatest ? 'bg-white/80' : 'bg-white/30'}`}
                />
              </div>
              <span className="text-[9px] text-white/35 truncate w-full text-center">
                {SUPPLIERS[d.supplier]?.slice(0, 3)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Fillup Row ─────────────────────────────────────────────────────────────────

function FillupRow({ fillup, isLast, avgPricePerGal }) {
  const isWithdrawal = fillup.type === 'withdrawal'
  const gallons      = Math.abs(fillup.gallons_added)
  const estCost      = isWithdrawal && avgPricePerGal
    ? (gallons * avgPricePerGal).toFixed(2)
    : null

  return (
    <div className={`flex items-center justify-between py-3 ${!isLast ? 'border-b border-white/[0.05]' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0 text-white/40">
          {isWithdrawal ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
              strokeLinecap="round" className="w-4 h-4">
              <path d="M12 19V5M5 12l7 7 7-7" />
            </svg>
          ) : (
            <IconDrop />
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-white">
            {isWithdrawal ? 'Withdrawal' : SUPPLIERS[fillup.supplier]}
          </p>
          <p className="text-[10px] text-white/35 mt-0.5">
            {formatDate(fillup.date)} · {isWithdrawal ? `-${gallons}` : `+${gallons}`} gal
          </p>
        </div>
      </div>
      <div className="text-right">
        {isWithdrawal ? (
          <>
            <p className="text-xs font-semibold text-white">
              {estCost ? `-$${estCost}` : `${gallons} gal`}
            </p>
            {estCost && (
              <p className="text-[10px] text-white/35 mt-0.5">avg ${avgPricePerGal}/gal</p>
            )}
          </>
        ) : (
          <>
            <p className="text-xs font-semibold text-white">${fillup.total_cost?.toFixed(2)}</p>
            <p className="text-[10px] text-white/35 mt-0.5">${fillup.price_per_gallon}/gal</p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Flight Fuel Row ────────────────────────────────────────────────────────────

function FlightFuelRow({ flight, isLast }) {
  return (
    <div className={`flex items-center justify-between py-3 ${!isLast ? 'border-b border-white/[0.05]' : ''}`}>
      <div>
        <p className="text-xs font-semibold text-white">{formatDate(flight.date)}</p>
        <p className="text-[10px] text-white/35 mt-0.5">
          {flight.hours}h · {flight.fuel_start_gal} → {flight.fuel_end_gal} gal
        </p>
      </div>
      <div className="text-right">
        <p className="text-xs font-semibold text-white">{flight.consumed} gal</p>
        <p className="text-[10px] text-white/35 mt-0.5">{flight.galPerHour} gal/h</p>
      </div>
    </div>
  )
}

// ── Jerry Can SVG ──────────────────────────────────────────────────────────────

function JerryCanSVG({ canId, fillRatio, isMetal }) {
  const clipId  = `jc-clip-${canId}`
  const bodyY   = 13
  const bodyH   = 33
  const fillH   = Math.max(fillRatio * bodyH, 0)
  const fillY   = bodyY + bodyH - fillH

  const fillColor = isMetal
    ? `rgba(255,255,255,${0.15 + fillRatio * 0.45})`
    : `rgba(255,255,255,${0.08 + fillRatio * 0.22})`

  return (
    <svg viewBox="0 0 36 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <defs>
        <clipPath id={clipId}>
          <rect x="3" y={bodyY} width="30" height={bodyH} rx="3.5" />
        </clipPath>
      </defs>

      {/* Spout neck */}
      <rect x="12" y="5" width="12" height="10" rx="2"
        fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.14)" strokeWidth="1" />
      {/* Cap */}
      <rect x="14" y="1" width="8" height="6" rx="2"
        fill="rgba(255,255,255,0.09)" stroke="rgba(255,255,255,0.16)" strokeWidth="1" />

      {/* Body background */}
      <rect x="3" y={bodyY} width="30" height={bodyH} rx="3.5"
        fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.13)" strokeWidth="1" />

      {/* Fill level */}
      {fillRatio > 0 && (
        <rect x="3" y={fillY} width="30" height={fillH + 0.5}
          fill={fillColor} clipPath={`url(#${clipId})`} />
      )}

      {/* Rib lines on body (detail) */}
      <line x1="3" y1={bodyY + bodyH * 0.33} x2="33" y2={bodyY + bodyH * 0.33}
        stroke="rgba(255,255,255,0.07)" strokeWidth="1" />
      <line x1="3" y1={bodyY + bodyH * 0.66} x2="33" y2={bodyY + bodyH * 0.66}
        stroke="rgba(255,255,255,0.07)" strokeWidth="1" />

      {/* Handle on right side */}
      <path d="M33 20 Q40 20 40 30 Q40 40 33 40"
        stroke="rgba(255,255,255,0.12)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  )
}

// ── Jerry Can Card ─────────────────────────────────────────────────────────────

function JerryCanCard({ can, onCycle }) {
  const cap       = parseFloat(can.capacity_gallons)
  const cur       = parseFloat(can.current_gallons)
  const fillRatio = cap > 0 ? cur / cap : 0
  const isMetal   = can.material === 'metal'

  const levelLabel = fillRatio >= 1 ? 'Full'
    : fillRatio > 0 ? 'Half'
    : 'Empty'

  const levelColor = fillRatio >= 1 ? 'text-white/70'
    : fillRatio > 0 ? 'text-white/45'
    : 'text-white/20'

  return (
    <button
      onClick={() => onCycle(can)}
      className="flex flex-col items-center gap-1.5 select-none active:scale-95 transition-transform"
    >
      <div className="w-10 h-14 relative">
        <JerryCanSVG canId={can.id} fillRatio={fillRatio} isMetal={isMetal} />
      </div>
      <p className={`text-[10px] font-semibold ${levelColor}`}>{levelLabel}</p>
      <p className="text-[9px] text-white/25">{cap}g</p>
    </button>
  )
}

// ── Jerry Cans Section ─────────────────────────────────────────────────────────

function JerryCanSection({ cans, loading, cycleLevel, totalCurrentGal, totalCapacityGal }) {
  if (loading) return <div className="card animate-pulse h-28" />

  const metalCans   = cans.filter(c => c.material === 'metal')
  const plasticCans = cans.filter(c => c.material === 'plastic')

  return (
    <div className="card">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="label">Jerry Cans</p>
          <p className="text-xs text-white/40 mt-0.5">
            {totalCurrentGal.toFixed(1)} / {totalCapacityGal.toFixed(0)} gal · Tap to cycle level
          </p>
        </div>
        <div className="text-right">
          <p className="text-xl font-bold text-white">{totalCurrentGal.toFixed(1)}</p>
          <p className="text-[10px] text-white/30">gallons</p>
        </div>
      </div>

      {/* Metal cans row */}
      {metalCans.length > 0 && (
        <div className="mb-3">
          <p className="text-[9px] font-semibold text-white/25 uppercase tracking-widest mb-2.5">
            Metal · Transportable ({metalCans.length})
          </p>
          <div className="flex gap-4">
            {metalCans.map(can => (
              <JerryCanCard key={can.id} can={can} onCycle={cycleLevel} />
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      {metalCans.length > 0 && plasticCans.length > 0 && (
        <div className="border-t border-white/[0.05] my-3" />
      )}

      {/* Plastic cans row */}
      {plasticCans.length > 0 && (
        <div>
          <p className="text-[9px] font-semibold text-white/25 uppercase tracking-widest mb-2.5">
            Plastic · Facility only ({plasticCans.length})
          </p>
          <div className="flex gap-4">
            {plasticCans.map(can => (
              <JerryCanCard key={can.id} can={can} onCycle={cycleLevel} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Total Facility Card ────────────────────────────────────────────────────────

function TotalFacilityCard({ tankLevel, canTotal }) {
  const total     = (tankLevel ?? 0) + canTotal
  const fillRatio = TOTAL_FACILITY_CAPACITY > 0 ? Math.min(total / TOTAL_FACILITY_CAPACITY, 1) : 0
  const barColor  = fillRatio < 0.25 ? 'bg-white/80' : fillRatio < 0.6 ? 'bg-white/50' : 'bg-white/30'

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <p className="label">Total facility fuel</p>
        <p className="text-xs text-white/35">of {TOTAL_FACILITY_CAPACITY} gal capacity</p>
      </div>
      <div className="flex items-end gap-3 mb-3">
        <p className="text-3xl font-bold text-white leading-none">
          {tankLevel != null ? total.toFixed(1) : '—'}
        </p>
        <p className="text-sm text-white/40 mb-0.5">US gallons</p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${fillRatio * 100}%` }}
        />
      </div>

      {/* Breakdown */}
      <div className="flex gap-4">
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Facility tank</p>
          <p className="text-sm font-semibold text-white">{tankLevel != null ? `${tankLevel} gal` : '—'}</p>
        </div>
        <div className="w-px bg-white/[0.06]" />
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Jerry cans</p>
          <p className="text-sm font-semibold text-white">{canTotal.toFixed(1)} gal</p>
        </div>
        <div className="w-px bg-white/[0.06]" />
        <div>
          <p className="text-[10px] text-white/30 mb-0.5">Available</p>
          <p className="text-sm font-semibold text-white">
            {tankLevel != null
              ? `${(TOTAL_FACILITY_CAPACITY - total).toFixed(1)} gal`
              : '—'}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Fuel() {
  const { selectedAircraft } = useAircraft()
  const { fuelStats }        = useFlights(selectedAircraft?.id)
  const tank                 = useTank()
  const jerryCans            = useJerryCans()
  const [drawerOpen,    setDrawerOpen]    = useState(false)
  const [drawerMode,    setDrawerMode]    = useState('fillup')

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">
      <PageHeader
        title="Fuel"
        sub="Facility tank + flight consumption"
        action={{ label: 'Fill-up', onClick: () => { setDrawerMode('fillup'); setDrawerOpen(true) } }}
      />

      <div className="px-4 pb-6 space-y-5">

        {/* ── Total facility fuel ── */}
        <TotalFacilityCard
          tankLevel={tank.currentLevel}
          canTotal={jerryCans.totalCurrentGal}
        />

        {/* ── Tank gauge ── */}
        <TankGauge
          currentLevel={tank.currentLevel}
          fillPercent={tank.fillPercent}
          last={tank.lastFillup}
          onAdd={() => { setDrawerMode('fillup'); setDrawerOpen(true) }}
          onWithdraw={() => { setDrawerMode('withdrawal'); setDrawerOpen(true) }}
        />

        {/* ── Jerry cans ── */}
        <JerryCanSection
          cans={jerryCans.cans}
          loading={jerryCans.loading}
          cycleLevel={jerryCans.cycleLevel}
          totalCurrentGal={jerryCans.totalCurrentGal}
          totalCapacityGal={jerryCans.totalCapacityGal}
        />

        {/* ── Tank stats row ── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Total spent */}
          <div className="card text-center py-3">
            <div className="flex justify-center mb-1.5 text-white/30"><IconDollar /></div>
            <p className="text-lg font-bold text-white">
              {tank.totalSpent > 0 ? `$${tank.totalSpent.toFixed(0)}` : '—'}
            </p>
            <p className="label mt-0.5">Total spent</p>
          </div>
          {/* Avg price */}
          <div className="card text-center py-3">
            <div className="flex justify-center mb-1.5 text-white/30"><IconDrop /></div>
            <p className="text-lg font-bold text-white">
              {tank.avgPricePerGal ? `$${tank.avgPricePerGal}` : '—'}
            </p>
            <p className="label mt-0.5">Avg/gal</p>
          </div>
          {/* Monthly used */}
          <div className="card text-center py-3">
            <div className="flex justify-center mb-1.5 text-white/30"><IconFillup /></div>
            <p className="text-lg font-bold text-white">
              {tank.monthUsedGal > 0 ? `${tank.monthUsedGal}` : '—'}
            </p>
            <p className="label mt-0.5">Gal / month</p>
          </div>
        </div>

        {/* ── Fill-up history ── */}
        <div>
          <SectionHeader title="Fill-up log" />
          {tank.loading ? (
            <div className="card animate-pulse h-20" />
          ) : tank.fillups.length === 0 ? (
            <div className="card flex flex-col items-center py-10 gap-2">
              <p className="text-xs text-white/30">No fill-ups yet — tap + Fill-up to log one.</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden px-4">
              {tank.fillups.map((f, i) => (
                <FillupRow
                  key={f.id}
                  fillup={f}
                  isLast={i === tank.fillups.length - 1}
                  avgPricePerGal={tank.avgPricePerGal}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Divider ── */}
        <div className="flex items-center gap-3">
          <div className="flex-1 border-t border-white/[0.06]" />
          <span className="text-[10px] text-white/20 uppercase tracking-widest">Flight consumption</span>
          <div className="flex-1 border-t border-white/[0.06]" />
        </div>

        {/* ── Flight fuel stats ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="card text-center py-3">
            <div className="flex justify-center mb-1.5 text-white/30"><IconFillup /></div>
            <p className="text-lg font-bold text-white">{fuelStats?.avgGalPerHour ?? '—'}</p>
            <p className="label mt-0.5">Avg gal/h</p>
          </div>
          <div className="card text-center py-3">
            <div className="flex justify-center mb-1.5 text-white/30"><IconDrop /></div>
            <p className="text-lg font-bold text-white">
              {fuelStats?.totalGal > 0 ? fuelStats.totalGal : '—'}
            </p>
            <p className="label mt-0.5">Total (gal)</p>
          </div>
          <div className="card text-center py-3">
            <div className="flex justify-center mb-1.5 text-white/30">
              <img src="/helicopter.png" alt="helicopter" className="w-4 h-4 object-contain"
                style={{ filter: 'brightness(0) invert(1)', opacity: 0.3 }} />
            </div>
            <p className="text-lg font-bold text-white">
              {fuelStats?.flightCount > 0 ? fuelStats.flightCount : '—'}
            </p>
            <p className="label mt-0.5">Flights tracked</p>
          </div>
        </div>

        {/* ── Per-flight log ── */}
        {fuelStats?.rateHistory?.length > 0 && (
          <div>
            <SectionHeader title="Flight fuel log" />
            <div className="card p-0 overflow-hidden px-4">
              {[...fuelStats.rateHistory].reverse().map((r, i, arr) => (
                <FlightFuelRow key={i} flight={r} isLast={i === arr.length - 1} />
              ))}
            </div>
          </div>
        )}
      </div>

      <TankFillupDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={tank.refresh}
        lastGallonsAfter={tank.currentLevel}
        defaultMode={drawerMode}
      />
    </div>
  )
}
