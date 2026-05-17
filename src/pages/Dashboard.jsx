import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import { useMaintenance, FLUID_TYPES } from '../hooks/useMaintenance'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
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
            <p className="text-[8px] text-white/35 mt-0.5">of 140</p>
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

function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const toHobbs = mins => Math.floor(mins / 6) / 10

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
  const { selectedAircraft } = useAircraft()
  const { flights, stats, fuelStats, refresh } = useFlights(selectedAircraft?.id)
  const maint      = useMaintenance(selectedAircraft?.id, selectedAircraft?.hobbs_current)
  const maintItems = useMaintenanceItems(selectedAircraft?.id, selectedAircraft?.hobbs_current, selectedAircraft?.cycles_current)
  const navigate = useNavigate()
  const [flightDrawerOpen,    setFlightDrawerOpen]    = useState(false)
  const [tankDrawerOpen,      setTankDrawerOpen]      = useState(false)
  const [maintDrawerOpen,     setMaintDrawerOpen]     = useState(false)
  const [hobbsHistoryOpen,    setHobbsHistoryOpen]    = useState(false)
  const tank = useTank()

  const hobbs   = selectedAircraft?.hobbs_current
  const cycles  = selectedAircraft?.cycles_current
  const recentFlights = flights.slice(0, 4)

  const QUICK_ACTIONS = [
    { label: 'Log Flight', color: 'bg-white/10 text-white', icon: <IconFlight />, onClick: () => setFlightDrawerOpen(true) },
    { label: 'Fuel Tank',  color: 'bg-white/10 text-white', icon: <IconFuel />,   onClick: () => setTankDrawerOpen(true) },
    { label: 'Maint.',     color: 'bg-white/10 text-white', icon: <IconWrench />, onClick: () => setMaintDrawerOpen(true) },
  ]

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">
      <div className="px-4 pt-5 pb-2">
        <h1 className="page-title">Dashboard</h1>
        <p className="text-xs text-white/40 mt-0.5">
          {selectedAircraft
            ? `${selectedAircraft.tail_number} · ${selectedAircraft.make_model}`
            : 'Select an aircraft to begin'}
        </p>
      </div>

      <div className="px-4 pb-6 space-y-5">
        {/* Hobbs banner */}
        {hobbs != null && (
          <div
            className="card border-white/[0.08] flex items-center justify-between cursor-pointer active:opacity-75 transition-opacity select-none"
            onClick={() => setHobbsHistoryOpen(true)}
          >
            <div>
              <p className="label mb-1">Current Hobbs</p>
              <p className="text-4xl font-bold text-white tracking-tight">
                {hobbs.toLocaleString()}
                <span className="text-base text-white/40 font-normal ml-1.5">h</span>
              </p>
              {cycles != null && (
                <p className="text-sm text-white/35 mt-1 font-medium">
                  {cycles.toLocaleString()}
                  <span className="text-xs font-normal text-white/25 ml-1">cycles</span>
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="badge badge-green">Active</span>
              <p className="text-[11px] text-white/25 mt-1">{hobbsLastUpdated(flights)}</p>
              <p className="text-[10px] text-white/20 mt-0.5">Tap for history ›</p>
            </div>
          </div>
        )}

        {/* 2×2 stat grid */}
        <div>
          <SectionHeader title="This month" />
          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={<IconFlight />} label="Flights"         value={stats.allHours ?? stats.monthHours} sub={stats.total ? `${stats.total} flight${stats.total > 1 ? 's' : ''}` : 'No flights yet'} onClick={() => navigate('/flights')} />
            <div
              className="stat-card cursor-pointer active:opacity-80 transition-opacity select-none"
              onClick={() => navigate('/employees')}
            >
              <div className="icon-box w-9 h-9 bg-navy-700">
                <span className="text-slate-400">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </span>
              </div>
              <div>
                <p className="label mb-1">Team</p>
                <p className="text-xl font-bold text-white leading-none">6</p>
                <p className="text-[11px] text-slate-500 mt-1">3 pilots · 3 mechanics</p>
              </div>
            </div>
            <MaintStatusCard maintItems={maintItems} onClick={() => navigate('/maintenance')} />
            <TankMiniCard tank={tank} onClick={() => navigate('/fuel')} />
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <SectionHeader title="Quick actions" />
          <div className="grid grid-cols-3 gap-2">
            {QUICK_ACTIONS.map(({ label, color, icon, onClick }) => (
              <button
                key={label}
                onClick={onClick}
                className="flex flex-col items-center gap-2 py-3 rounded-2xl
                           bg-navy-800 border border-white/[0.06]
                           active:scale-95 transition-transform select-none"
              >
                <span className={`icon-box w-10 h-10 rounded-xl ${color}`}>{icon}</span>
                <span className="text-[10px] font-medium text-white/40 text-center leading-tight">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Maintenance overview */}
        <div>
          <SectionHeader title="Maintenance" action={{ label: 'View all', onClick: () => navigate('/maintenance') }} />
          <div className="card space-y-4">

            {/* Grease timer compact */}
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => navigate('/maintenance')}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
                    strokeLinecap="round" className="w-4 h-4 text-white/50">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Grease interval</p>
                  <p className="text-[10px] text-white/35 mt-0.5">
                    {maint.grease.hoursSince != null
                      ? `${maint.grease.hoursSince.toFixed(1)}h flown since last`
                      : 'No grease log yet'}
                  </p>
                </div>
              </div>
              {maint.grease.overdue ? (
                <span className="badge bg-white text-black text-[10px]">OVERDUE</span>
              ) : maint.grease.warning ? (
                <span className="badge bg-white/10 text-white text-[10px] animate-pulse">Due soon</span>
              ) : maint.grease.hoursLeft != null ? (
                <span className="text-xs text-white/40">{maint.grease.hoursLeft.toFixed(1)}h left</span>
              ) : null}
            </div>

            {/* Grease progress bar */}
            <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden -mt-2">
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(1 - (maint.grease.progress ?? 0)) * 100}%`,
                  backgroundColor: maint.grease.overdue
                    ? 'rgba(255,255,255,0.9)'
                    : 'rgba(255,255,255,0.35)',
                }} />
            </div>

            {/* Fluid status dots */}
            <div className="flex items-center gap-4 pt-1 border-t border-white/[0.05]">
              {Object.entries(FLUID_TYPES).map(([type, { short }]) => {
                const s = maint.getFluidStatus(type)
                return (
                  <div key={type} className="flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.last ? 'bg-white/60' : 'bg-white/15'}`} />
                    <span className="text-[10px] text-white/40">{short}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Recent flights */}
        <div className="card">
          <SectionHeader title="Recent flights" action={{ label: 'See all', onClick: () => navigate('/flights') }} />
          {recentFlights.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/25">
                <IconFlight />
              </div>
              <p className="text-xs text-white/25">No flights yet</p>
            </div>
          ) : (
            <div className="space-y-0">
              {recentFlights.map((f, i) => (
                <div
                  key={f.id}
                  className={`flex items-center justify-between py-2.5
                    ${i < recentFlights.length - 1 ? 'border-b border-white/[0.05]' : ''}`}
                >
                  <div>
                    <p className="text-xs font-semibold text-white">{flightRoute(f)}</p>
                    <p className="text-[10px] text-white/30">{formatDate(f.date)}</p>
                  </div>
                  <p className="text-xs text-white/50">{formatDuration(f.total_minutes)}</p>
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
