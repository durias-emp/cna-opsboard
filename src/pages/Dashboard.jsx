import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toHobbs, formatDate } from '../lib/utils'
import { useAircraft } from '../context/AircraftContext'
import PullDownMenu from '../components/PullDownMenu'
import { useFlights } from '../hooks/useFlights'
import { useMaintenance, FLUID_TYPES } from '../hooks/useMaintenance'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import { useEmployeeFlights } from '../hooks/useEmployeeFlights'
import StatCard from '../components/StatCard'
import SectionHeader from '../components/SectionHeader'
import FlightDrawer from '../components/FlightDrawer'
import TankFillupDrawer from '../components/TankFillupDrawer'
import MaintenanceDrawer from '../components/MaintenanceDrawer'
import HobbsHistoryDrawer from '../components/HobbsHistoryDrawer'
import { useTank } from '../hooks/useTank'

const IconFlight = () => (
  <img src="/helicopter.png" alt="helicopter" className="w-5 h-5 object-contain opacity-50"
    style={{ filter: 'brightness(0) invert(1)' }} />
)
const IconFuel = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M3 22V8l9-6 9 6v14H3zM10 22V12h4v10" />
  </svg>
)
const IconWrench = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
  </svg>
)
// ── Fluid status mini-card ─────────────────────────────────────────────────────

const FLUID_SHORT = {
  engine_oil:       'Eng. Oil',
  transmission_oil: 'Trans.',
  hydraulic_fluid:  'Hyd.',
}

const FLUID_REF_HOURS = 100

function FluidStatusCard({ maint }) {
  const fluids = Object.keys(FLUID_TYPES).map(type => {
    const status = maint.getFluidStatus(type)
    const hoursSince = status.hoursSince ?? 0
    const hasData    = !!status.last
    const pct = hasData
      ? Math.max((1 - hoursSince / FLUID_REF_HOURS) * 100, 2)
      : 100
    const isLow = hasData && pct < 30
    return { type, short: FLUID_SHORT[type], hoursSince, hasData, pct, isLow }
  })

  return (
    <div className="stat-card flex flex-col justify-between gap-3">
      <p className="label">Fluids</p>
      <div className="space-y-2.5">
        {fluids.map(({ type, short, hoursSince, hasData, pct, isLow }) => (
          <div key={type}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/40">{short}</span>
              <span className="text-[10px] text-white/40">
                {hasData ? `${hoursSince}h ago` : '—'}
              </span>
            </div>
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${pct}%`,
                  backgroundColor: isLow
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.4)',
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Tank mini card ─────────────────────────────────────────────────────────────

function TankMiniCard({ tank, onClick }) {
  const { fillPercent, currentLevel, lastFillup } = tank
  const r    = 26
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - (fillPercent ?? 0))
  const isLow  = fillPercent != null && fillPercent < 0.25
  const ringColor = isLow
    ? 'rgba(255,255,255,0.9)'
    : fillPercent < 0.6
      ? 'rgba(255,255,255,0.55)'
      : 'rgba(255,255,255,0.35)'
  const lastDate = lastFillup?.date
    ? new Date(lastFillup.date + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="stat-card cursor-pointer active:opacity-80 transition-opacity select-none flex flex-col gap-3"
      onClick={onClick}>

      <p className="label">External tank</p>

      {/* Ring centred */}
      <div className="flex justify-center">
        <div className="relative" style={{ width: 68, height: 68 }}>
          <svg className="w-full h-full -rotate-90" viewBox="0 0 68 68">
            <circle cx="34" cy="34" r={r} fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth="7" />
            <circle cx="34" cy="34" r={r} fill="none"
              stroke={ringColor}
              strokeWidth="7"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-base font-bold text-white leading-none">
              {currentLevel != null ? currentLevel : '—'}
            </p>
            <p className="text-[8px] text-white/35 mt-0.5">of 150</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="label">Level</p>
          <p className="text-xs font-bold text-white">
            {currentLevel != null ? `${Math.round(fillPercent * 100)}%` : '—'}
          </p>
        </div>
        {lastDate && (
          <div className="flex items-center justify-between">
            <p className="label">Fill-up</p>
            <p className="text-[10px] font-semibold text-white/60">{lastDate}</p>
          </div>
        )}
        {isLow && currentLevel != null && (
          <span className="badge bg-white text-black text-[9px] animate-pulse mt-1">Low</span>
        )}
      </div>
    </div>
  )
}

function flightRoute(flight) {
  const first = flight.legs?.[0]
  const last = flight.legs?.[flight.legs.length - 1]
  if (!first?.takeoff_location || !last?.landing_location) return '—'
  return `${first.takeoff_location} → ${last.landing_location}`
}

function formatDuration(mins) {
  if (!mins) return '—'
  return `${toHobbs(mins).toFixed(1)}h`
}

function hobbsLastUpdated(flights) {
  const lastDate = flights?.[0]?.date
  if (!lastDate) return 'No flights logged'
  const _ld = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const today     = _ld(new Date())
  const yesterday = _ld(new Date(Date.now() - 86400000))
  if (lastDate === today)      return 'Last updated today'
  if (lastDate === yesterday)  return 'Last updated yesterday'
  return `Last updated ${new Date(lastDate + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
}



// ── Maintenance status mini-card ───────────────────────────────────────────────

function MaintStatusCard({ maintItems, onClick }) {
  const overdue  = maintItems.overdue.length
  const dueSoon  = maintItems.dueSoon.length
  const ok       = maintItems.ok.length

  // Most urgent item to surface
  const topItem = maintItems.overdue[0] ?? maintItems.dueSoon[0] ?? null

  return (
    <div
      className="stat-card cursor-pointer active:opacity-80 transition-opacity select-none overflow-hidden"
      onClick={onClick}
    >
      <p className="label">Maintenance</p>

      {/* Copper-line image: grayscale→invert turns white bg to black,
          screen blend makes black transparent → clean white lines on card */}
      <div className="flex-1" style={{ backgroundColor: '#1A1A1A', isolation: 'isolate', paddingTop: '0.75rem' }}>
        <img
          src="/Bell-Long-Ranger-206L-copper-line.png"
          alt="helicopter"
          className="w-full object-contain select-none pointer-events-none"
          style={{
            filter: 'grayscale(1) invert(1) brightness(1.8)',
            opacity: 0.35,
            mixBlendMode: 'screen',
          }}
        />
      </div>

      {/* Counts — monochromatic, no dividers */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center flex-1">
          <p className="text-base font-bold leading-none text-white">{overdue}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wide mt-0.5">Over</p>
        </div>
        <div className="flex flex-col items-center flex-1">
          <p className="text-base font-bold leading-none text-white">{dueSoon}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wide mt-0.5">Soon</p>
        </div>
        <div className="flex flex-col items-center flex-1">
          <p className="text-base font-bold leading-none text-white">{ok}</p>
          <p className="text-[9px] text-white/30 uppercase tracking-wide mt-0.5">OK</p>
        </div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const { aircraft, selectedAircraft, setSelectedAircraft } = useAircraft()
  const { flights, stats, fuelStats, refresh } = useFlights(selectedAircraft?.id)
  const maint      = useMaintenance(selectedAircraft?.id, selectedAircraft?.hobbs_current)
  const maintItems = useMaintenanceItems(selectedAircraft?.id, selectedAircraft?.hobbs_current, selectedAircraft?.cycles_current)
  const navigate = useNavigate()
  const [flightDrawerOpen,    setFlightDrawerOpen]    = useState(false)
  const [tankDrawerOpen,      setTankDrawerOpen]      = useState(false)
  const [maintDrawerOpen,     setMaintDrawerOpen]     = useState(false)
  const [hobbsHistoryOpen,    setHobbsHistoryOpen]    = useState(false)
  const tank = useTank()
  const { pilots, mechanics, operations } = useEmployeeFlights(selectedAircraft?.id)
  const teamSize = pilots.length + mechanics.length + operations.length

  const hobbs   = selectedAircraft?.hobbs_current
  const cycles  = selectedAircraft?.cycles_current
  const recentFlights = flights.slice(0, 4)

  const QUICK_ACTIONS = [
    { label: 'Log Flight', color: 'bg-white/10 text-white', icon: <IconFlight />, onClick: () => setFlightDrawerOpen(true) },
    { label: 'Fuel Tank',  color: 'bg-white/10 text-white', icon: <IconFuel />,   onClick: () => setTankDrawerOpen(true) },
    { label: 'Maint.',     color: 'bg-white/10 text-white', icon: <IconWrench />, onClick: () => setMaintDrawerOpen(true) },
  ]

  const overdueCount = maintItems.overdue.length
  const dueSoonCount = maintItems.dueSoon.length
  const nextDue = maintItems.items
    .filter(i => i.hrsRemaining != null && i.hrsRemaining > 0)
    .sort((a, b) => a.hrsRemaining - b.hrsRemaining)[0] ?? null
  const lastFlight = flights[0] ?? null

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">

      {/* ── Brand crest — centered above everything, mark only ── */}
      <div className="flex justify-center pt-4 pb-1">
        <img src="/cna-mark-white.png" alt="CNA" className="h-6 opacity-90 select-none" draggable="false" />
      </div>

      {/* ── Hero — the aircraft is the interface ── */}
      <div className="px-5 pt-2">
        <PullDownMenu
          items={aircraft.map(a => ({
            key: a.id,
            label: a.tail_number,
            checked: a.id === selectedAircraft?.id,
            onSelect: () => setSelectedAircraft(a),
          }))}
          trigger={toggle => (
            <button onClick={toggle} className="flex items-center gap-1.5 select-none active:opacity-70">
              <h1 className="text-[26px] font-bold text-white leading-tight tracking-tight">
                {selectedAircraft?.tail_number ?? '—'}
              </h1>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                strokeLinecap="round" className="w-4 h-4 text-white/40 mt-1"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          )}
        />
        <p className="text-[13px] text-white/40 mt-0.5 font-medium">
          {hobbs != null && <>{hobbs.toLocaleString()} h</>}
          {cycles != null && <span className="text-white/25"> · {cycles.toLocaleString()} cyc</span>}
          <span className="text-white/25"> · Parked</span>
        </p>
      </div>

      <button onClick={() => setHobbsHistoryOpen(true)} className="hero-stage block w-full select-none">
        <img src="/heli-hero.png" alt={selectedAircraft?.make_model ?? 'Bell 206B3 JetRanger'}
          className="hero-heli" draggable="false" />
      </button>

      {/* Quick verbs — icon row under the aircraft */}
      <div className="flex justify-center gap-3 px-5 -mt-1 mb-5">
        <button className="hero-icon-btn" aria-label="Log flight" onClick={() => setFlightDrawerOpen(true)}>
          <IconFlight />
        </button>
        <button className="hero-icon-btn" aria-label="Fuel tank" onClick={() => setTankDrawerOpen(true)}>
          <IconFuel />
        </button>
        <button className="hero-icon-btn" aria-label="Log maintenance service" onClick={() => setMaintDrawerOpen(true)}>
          <IconWrench />
        </button>
        <button className="hero-icon-btn" aria-label="Flights and itineraries" onClick={() => navigate('/flights')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
          </svg>
        </button>
      </div>

      <div className="px-4 pb-6 space-y-5">

        {/* ── Status rows ── */}
        <div className="trow-group">

          <button className="trow" onClick={() => navigate('/maintenance')}>
            <span className={`w-1 self-stretch rounded-full flex-shrink-0 ${overdueCount > 0 ? 'bg-red-500/80' : dueSoonCount > 0 ? 'bg-amber-400/70' : 'bg-white/10'}`} />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white">Maintenance</p>
              <p className="text-[12px] text-white/40 mt-0.5 truncate">
                {overdueCount > 0
                  ? `${overdueCount} overdue · ${dueSoonCount} due soon`
                  : nextDue
                    ? `Next: ${nextDue.description}`
                    : 'All items OK'}
              </p>
            </div>
            <span className="ml-auto text-[13px] text-white/45 tabular-nums flex-shrink-0">
              {overdueCount > 0 ? `${overdueCount + dueSoonCount} items` : nextDue ? `in ${nextDue.hrsRemaining.toFixed(1)} h` : ''}
            </span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="chev w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>
          </button>

          <button className="trow" onClick={() => navigate('/fuel')}>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between">
                <p className="text-[14px] font-semibold text-white">Fuel tank</p>
                <p className="text-[13px] text-white/45 tabular-nums">
                  {tank.currentLevel != null ? `${tank.currentLevel} gal · ${Math.round(tank.fillPercent * 100)}%` : '—'}
                </p>
              </div>
              <div className="h-[3px] rounded-full bg-white/[0.08] overflow-hidden mt-2.5">
                <div className="h-full rounded-full bg-accent transition-all duration-700"
                  style={{ width: `${(tank.fillPercent ?? 0) * 100}%` }} />
              </div>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="chev w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>
          </button>

          <button className="trow" onClick={() => navigate('/flights')}>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white">Flights</p>
              <p className="text-[12px] text-white/40 mt-0.5">
                {stats.total ? `${stats.allHours ?? stats.monthHours} this month · ${stats.total} flights` : 'No flights yet'}
                {lastFlight && ` · last ${formatDate(lastFlight.date)}`}
              </p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="chev w-4 h-4 ml-auto"><path d="M9 18l6-6-6-6" /></svg>
          </button>

          <button className="trow" onClick={() => navigate('/employees')}>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white">Team</p>
              <p className="text-[12px] text-white/40 mt-0.5">
                {teamSize} people · {pilots.length} pilots · {mechanics.length} mechanics · {operations.length} ops
              </p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="chev w-4 h-4 ml-auto"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

        {/* Recent flights — finance-style tiles */}
        <div>
          <div className="flex items-baseline justify-between px-1 mb-2.5">
            <p className="text-[13px] font-semibold text-white/45">Recent flights</p>
            <button className="text-[13px] font-semibold text-accent active:opacity-70" onClick={() => navigate('/flights')}>See all</button>
          </div>
          {recentFlights.length === 0 ? (
            <div className="tile-group flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/25">
                <IconFlight />
              </div>
              <p className="text-xs text-white/25">No flights yet</p>
            </div>
          ) : (
            <div className="tile-group">
              {recentFlights.map(f => (
                <div key={f.id} className="tile" onClick={() => navigate('/flights')}>
                  <div className="tile-icon"><IconFlight /></div>
                  <div className="tile-body">
                    <div className="min-w-0">
                      <p className="tile-title">{flightRoute(f)}</p>
                      <p className="tile-sub">{formatDate(f.date)}</p>
                    </div>
                    <p className="tile-value">{formatDuration(f.total_minutes)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <FlightDrawer
        open={flightDrawerOpen}
        onClose={() => setFlightDrawerOpen(false)}
        onSaved={refresh}
      />
      <TankFillupDrawer
        open={tankDrawerOpen}
        onClose={() => setTankDrawerOpen(false)}
        onSaved={tank.refresh}
        lastGallonsAfter={tank.currentLevel}
      />
      <MaintenanceDrawer
        open={maintDrawerOpen}
        onClose={() => setMaintDrawerOpen(false)}
        onSaved={maint.refresh}
        defaultType="engine_oil"
      />
      <HobbsHistoryDrawer
        open={hobbsHistoryOpen}
        onClose={() => setHobbsHistoryOpen(false)}
        flights={flights}
        currentHobbs={hobbs}
        tailNumber={selectedAircraft?.tail_number}
      />
    </div>
  )
}
