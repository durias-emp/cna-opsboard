import { useState } from 'react'
import { formatDate } from '../lib/utils'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import { useTank, TANK_MAX_GAL, SUPPLIERS } from '../hooks/useTank'
import { useJerryCans } from '../hooks/useJerryCans'
import PageHeader from '../components/PageHeader'
import SectionHeader from '../components/SectionHeader'
import TankFillupDrawer from '../components/TankFillupDrawer'

const TOTAL_FACILITY_CAPACITY = 190 // 150 tank + 40 jerry cans

// ── Icons ──────────────────────────────────────────────────────────────────────

const IconDrop = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
)
const IconFillup = () => (
  <img src="/gasoline-pump.png" alt="fuel" className="w-4 h-4 object-contain"
    style={{ filter: 'brightness(0) invert(1)', opacity: 0.3 }} />
)
const IconDollar = () => (
  <img src="/dollar-symbol.png" alt="dollar" className="w-4 h-4 object-contain"
    style={{ filter: 'brightness(0) invert(1)', opacity: 0.3 }} />
)

// ── Tank Gauge ─────────────────────────────────────────────────────────────────

function TankGauge({ currentLevel, fillPercent, last, onAdd, onWithdraw }) {
  const r    = 52
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - (fillPercent ?? 0))

  const isEmpty  = currentLevel === null
  const isLow    = !isEmpty && fillPercent < 0.25
  const isMedium = !isEmpty && fillPercent >= 0.25 && fillPercent < 0.6

  const ringColor = isEmpty  ? 'rgba(255,255,255,0.08)'
    : isLow   ? 'rgba(248,113,113,0.9)'
    : isMedium ? 'rgba(44,185,189,0.65)'
    : 'rgba(44,185,189,0.9)'

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
            <p className="label mb-1">Fuel used</p>
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

// ── Jerry Cans Section ─────────────────────────────────────────────────────────

function JerryCanSection({ cans, loading, setLevel, totalCurrentGal, totalCapacityGal }) {
  const [showModal, setShowModal] = useState(false)

  if (loading) return <div className="card animate-pulse h-48" />

  const fillPercent = totalCapacityGal > 0 ? totalCurrentGal / totalCapacityGal : 0
  const isLow       = fillPercent < 0.25
  const isMedium    = fillPercent >= 0.25 && fillPercent < 0.6

  const r      = 52
  const circ   = 2 * Math.PI * r
  const offset = circ * (1 - fillPercent)

  const ringColor = isLow    ? 'rgba(248,113,113,0.9)'
    : isMedium ? 'rgba(44,185,189,0.65)'
    : 'rgba(44,185,189,0.9)'

  return (
    <>
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="label">Jerry Cans</p>
            <p className="text-xs text-white/40 mt-0.5">Max {totalCapacityGal.toFixed(0)} gal · US Gallons</p>
          </div>
          <div className="flex items-center gap-2">
            {isLow && <span className="badge bg-white text-black text-[10px] animate-pulse">Low</span>}
            <img src="/combustible.png" alt="jerry cans" className="w-8 h-8 object-contain opacity-40" style={{ filter: 'brightness(0) invert(1)' }} />
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
                {totalCurrentGal.toFixed(1)}
              </p>
              <p className="text-[10px] text-white/35 mt-0.5">of {totalCapacityGal.toFixed(0)} gal</p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex-1 space-y-3">
            <div>
              <p className="label mb-1">Level</p>
              <p className="text-xl font-bold text-white">{Math.round(fillPercent * 100)}%</p>
            </div>
            <div>
              <p className="label mb-1">Available</p>
              <p className="text-sm font-semibold text-white">{totalCurrentGal.toFixed(1)} gal</p>
            </div>
            <div>
              <p className="label mb-1">Cans</p>
              <p className="text-xs text-white/60">{cans.length} total</p>
            </div>
          </div>
        </div>

        {/* Action button */}
        <div className="mt-4 pt-4 border-t border-white/[0.05]">
          <button
            onClick={() => setShowModal(true)}
            className="w-full py-2.5 rounded-xl border border-white/10 text-xs font-medium
                       text-white/50 flex items-center justify-center gap-1.5
                       active:bg-white/5 transition-colors select-none"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
              <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5"/>
              <path d="M15.5 2.5a2.121 2.121 0 0 1 3 3L12 12l-4 1 1-4 6.5-6.5z"/>
            </svg>
            Update levels
          </button>
        </div>
      </div>

      {/* Update modal */}
      {showModal && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setShowModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full rounded-t-2xl border-t border-white/[0.05] p-5 pb-10 space-y-3"
            style={{ background: '#111113' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-bold text-white">Update Jerry Can Levels</p>
              <button onClick={() => setShowModal(false)}
                className="text-white/40 text-xs active:text-white/70">Done</button>
            </div>

            {cans.map((can, i) => {
              const cap       = parseFloat(can.capacity_gallons)
              const cur       = parseFloat(can.current_gallons)
              const fillRatio = cap > 0 ? cur / cap : 0
              const level     = fillRatio >= 1 ? 'full' : cur > 0 ? 'half' : 'empty'

              return (
                <div key={can.id} className="flex items-center justify-between py-2.5
                  border-b border-white/[0.05] last:border-0">
                  <div>
                    <p className="text-xs font-semibold text-white">Can {i + 1}</p>
                    <p className="text-[10px] text-white/30 capitalize mt-0.5">{can.material} · {cap} gal</p>
                  </div>
                  {/* Segmented toggle */}
                  <div className="flex rounded-xl overflow-hidden text-[10px] font-bold">
                    {[
                      { key: 'empty', label: 'Empty', val: 0 },
                      { key: 'half',  label: 'Half',  val: parseFloat((cap / 2).toFixed(1)) },
                      { key: 'full',  label: 'Full',  val: cap },
                    ].map(opt => (
                      <button
                        key={opt.key}
                        onClick={() => setLevel(can, opt.val).catch(err => alert(err.message))}
                        className={`px-3 py-2 select-none transition-colors
                          ${level === opt.key
                            ? 'bg-white text-black'
                            : 'bg-white/[0.04] text-white/40 active:bg-white/[0.10]'
                          }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}

// ── Total Facility Card ────────────────────────────────────────────────────────

function TotalFacilityCard({ tankLevel, canTotal }) {
  const total     = (tankLevel ?? 0) + canTotal
  const fillRatio = TOTAL_FACILITY_CAPACITY > 0 ? Math.min(total / TOTAL_FACILITY_CAPACITY, 1) : 0
  const barColor  = fillRatio < 0.25 ? 'bg-red-400/80' : 'bg-accent'

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
              ? `${total.toFixed(1)} gal`
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
  const [spentModal,    setSpentModal]    = useState(false)
  const [avgModal,      setAvgModal]      = useState(false)
  const [monthModal,    setMonthModal]    = useState(false)

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
          setLevel={jerryCans.setLevel}
          totalCurrentGal={jerryCans.totalCurrentGal}
          totalCapacityGal={jerryCans.totalCapacityGal}
        />

        {/* ── Tank stats row ── */}
        <div className="grid grid-cols-3 gap-3">
          {/* Total spent */}
          <button className="card text-center py-3 active:bg-white/[0.07] transition-colors select-none"
            onClick={() => setSpentModal(true)}>
            <div className="flex justify-center mb-1.5 text-white/30"><IconDollar /></div>
            <p className="text-lg font-bold text-white">
              {tank.totalSpent > 0 ? `$${tank.totalSpent.toFixed(0)}` : '—'}
            </p>
            <p className="label mt-0.5">Total spent</p>
          </button>
          {/* Avg price */}
          <button className="card text-center py-3 active:bg-white/[0.07] transition-colors select-none"
            onClick={() => setAvgModal(true)}>
            <div className="flex justify-center mb-1.5 text-white/30"><IconDrop /></div>
            <p className="text-lg font-bold text-white">
              {tank.avgPricePerGal ? `$${tank.avgPricePerGal}` : '—'}
            </p>
            <p className="label mt-0.5">Avg/gal</p>
          </button>
          {/* Monthly used */}
          <button className="card text-center py-3 active:bg-white/[0.07] transition-colors select-none"
            onClick={() => setMonthModal(true)}>
            <div className="flex justify-center mb-1.5 text-white/30"><IconFillup /></div>
            <p className="text-lg font-bold text-white">
              {tank.monthUsedGal > 0 ? `${tank.monthUsedGal}` : '—'}
            </p>
            <p className="label mt-0.5">Gal / month</p>
          </button>
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
          <div className="flex-1 border-t border-white/[0.05]" />
          <span className="text-[10px] text-white/20 uppercase tracking-widest">Flight consumption</span>
          <div className="flex-1 border-t border-white/[0.05]" />
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

      {/* ── Monthly consumption modal ── */}
      {monthModal && (() => {
        const withdrawals = tank.fillups.filter(f => f.type === 'withdrawal')
        const byMonth = {}
        withdrawals.forEach(f => {
          const key = f.date.slice(0, 7) // "YYYY-MM"
          byMonth[key] = (byMonth[key] ?? 0) + Math.abs(f.gallons_added ?? 0)
        })
        const now = new Date()
        const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const months = Object.keys(byMonth).sort().reverse()
        const monthLabel = key => {
          const [y, m] = key.split('-')
          return new Date(parseInt(y), parseInt(m) - 1, 1)
            .toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        }
        return (
          <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setMonthModal(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative w-full rounded-t-2xl border-t border-white/[0.05] p-5 pb-10 max-h-[75vh] overflow-y-auto"
              style={{ background: '#111113' }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-bold text-white">Monthly Consumption</p>
                <button onClick={() => setMonthModal(false)}
                  className="text-white/40 text-xs active:text-white/70">Done</button>
              </div>

              {months.length === 0 ? (
                <p className="text-xs text-white/30 text-center py-6">No withdrawal records yet</p>
              ) : (
                <div>
                  {months.map((key, i, arr) => (
                    <div key={key}
                      className={`flex items-center justify-between py-3 ${i < arr.length - 1 ? 'border-b border-white/[0.05]' : ''}`}>
                      <div>
                        <p className="text-xs font-semibold text-white">{monthLabel(key)}</p>
                        {key === currentKey && (
                          <p className="text-[10px] text-white/35 mt-0.5">In progress</p>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-white tabular-nums">
                        {byMonth[key].toFixed(1)} gal
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Avg price modal ── */}
      {avgModal && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setAvgModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full rounded-t-2xl border-t border-white/[0.05] p-5 pb-10 max-h-[75vh] overflow-y-auto"
            style={{ background: '#111113' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-white">Price per Gallon</p>
                <p className="text-[11px] text-white/35 mt-0.5">
                  Avg: ${tank.avgPricePerGal}/gal
                </p>
              </div>
              <button onClick={() => setAvgModal(false)}
                className="text-white/40 text-xs active:text-white/70">Done</button>
            </div>

            {tank.fillups.filter(f => f.type === 'fillup').length === 0 ? (
              <p className="text-xs text-white/30 text-center py-6">No fill-ups recorded yet</p>
            ) : (
              <div>
                {tank.fillups.filter(f => f.type === 'fillup').map((f, i, arr) => (
                  <div key={f.id}
                    className={`flex items-center justify-between py-3 ${i < arr.length - 1 ? 'border-b border-white/[0.05]' : ''}`}>
                    <div>
                      <p className="text-xs font-semibold text-white">{formatDate(f.date)}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">
                        {SUPPLIERS[f.supplier] ?? f.supplier} · {f.gallons_added} gal
                      </p>
                    </div>
                    <p className="text-xs font-semibold text-white">${f.price_per_gallon}/gal</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Total spent modal ── */}
      {spentModal && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={() => setSpentModal(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative w-full rounded-t-2xl border-t border-white/[0.05] p-5 pb-10 max-h-[75vh] overflow-y-auto"
            style={{ background: '#111113' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-bold text-white">Fill-up History</p>
                <p className="text-[11px] text-white/35 mt-0.5">
                  Total: ${tank.totalSpent.toFixed(2)}
                </p>
              </div>
              <button onClick={() => setSpentModal(false)}
                className="text-white/40 text-xs active:text-white/70">Done</button>
            </div>

            {/* Fillup rows */}
            {tank.fillups.filter(f => f.type === 'fillup').length === 0 ? (
              <p className="text-xs text-white/30 text-center py-6">No fill-ups recorded yet</p>
            ) : (
              <div>
                {tank.fillups.filter(f => f.type === 'fillup').map((f, i, arr) => (
                  <div key={f.id}
                    className={`flex items-center justify-between py-3 ${i < arr.length - 1 ? 'border-b border-white/[0.05]' : ''}`}>
                    <div>
                      <p className="text-xs font-semibold text-white">{formatDate(f.date)}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">
                        {SUPPLIERS[f.supplier] ?? f.supplier} · {f.gallons_added} gal
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-white">${f.total_cost?.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
