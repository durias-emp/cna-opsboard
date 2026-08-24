import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMotionValue, animate } from 'framer-motion'
import { toHobbs, formatDate } from '../lib/utils'
import { useAircraft } from '../context/AircraftContext'
import PullDownMenu from '../components/PullDownMenu'
import { useFlights } from '../hooks/useFlights'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import { useEmployeeFlights } from '../hooks/useEmployeeFlights'
import HobbsHistoryDrawer from '../components/HobbsHistoryDrawer'
import { useTank } from '../hooks/useTank'

// YS-CNA cruise burn (owner-provided, also used for quoting)
const CRUISE_BURN_GPH = 27

// CNA Monies' balance count-up: one motion value, one animate() call,
// formatted every frame. Fast launch, slow land — like a bank app counter.
function useAnimatedNumber(target, duration = 1.2) {
  const mv = useMotionValue(0)
  const [display, setDisplay] = useState(0)

  useEffect(() => mv.on('change', v => setDisplay(v)), [mv])

  useEffect(() => {
    if (target == null) return
    const controls = animate(mv, target, { duration, ease: [0.16, 1, 0.3, 1] })
    return controls.stop
  }, [target, mv, duration])

  return target == null ? null : display
}

const IconFlight = () => (
  <img src="/helicopter.png" alt="helicopter" className="w-5 h-5 object-contain opacity-50"
    style={{ filter: 'brightness(0) invert(1)' }} />
)
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



// Home header: CNA crest centered with the aircraft status chip. At rest it's
// large; scroll down and a compact frosted bar with a smaller crest stays stuck
// to the top (iOS large-title behavior, logo edition).
function CrestHeader({ tailNumber }) {
  const sentinel = useRef(null)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const el = sentinel.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setCompact(!e.isIntersecting), { threshold: 0 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const chip = (
    <div className="flex items-center gap-2 bg-white/[0.07] rounded-full px-3 py-1.5">
      <span className="relative flex w-1.5 h-1.5 flex-shrink-0">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full w-1.5 h-1.5 bg-green-400" />
      </span>
      <span className="text-xs font-semibold text-white">{tailNumber ?? '—'}</span>
    </div>
  )

  return (
    <>
      {/* Sticky compact bar — small crest, chip rides along */}
      <div
        className={`fixed top-0 left-0 right-0 z-[60] transition-opacity duration-200
                    ${compact ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'rgba(23,23,23,0.94)',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="relative flex items-center justify-center py-2.5">
          <img src="/cna-mark-white.png" alt="CNA" className="h-4 opacity-90 select-none" draggable="false" />
          <div className="absolute right-3 scale-90">{chip}</div>
        </div>
      </div>

      <div ref={sentinel} aria-hidden className="h-px" />

      {/* Large crest row */}
      <div className="relative flex items-center justify-center pt-4 pb-1 px-4">
        <img src="/cna-mark-white.png" alt="CNA" className="h-6 opacity-90 select-none" draggable="false" />
        <div className="absolute right-4">{chip}</div>
      </div>
    </>
  )
}

export default function Dashboard() {
  const { aircraft, selectedAircraft, setSelectedAircraft } = useAircraft()
  const { flights, stats, fuelStats, refresh } = useFlights(selectedAircraft?.id)
  const maintItems = useMaintenanceItems(selectedAircraft?.id, selectedAircraft?.hobbs_current, selectedAircraft?.cycles_current)
  const navigate = useNavigate()
  const [hobbsHistoryOpen,    setHobbsHistoryOpen]    = useState(false)
  const tank = useTank()
  const { pilots, mechanics, operations } = useEmployeeFlights(selectedAircraft?.id)
  const teamSize = pilots.length + mechanics.length + operations.length

  const hobbs   = selectedAircraft?.hobbs_current
  const cycles  = selectedAircraft?.cycles_current
  const recentFlights = flights.slice(0, 4)

  const overdueCount = maintItems.overdue.length
  const dueSoonCount = maintItems.dueSoon.length
  const nextDue = maintItems.items
    .filter(i => i.hrsRemaining != null && i.hrsRemaining > 0)
    .sort((a, b) => a.hrsRemaining - b.hrsRemaining)[0] ?? null
  const lastFlight = flights[0] ?? null

  const animHobbs     = useAnimatedNumber(hobbs)
  const animFuel      = useAnimatedNumber(tank.currentLevel)
  const animEndurance = useAnimatedNumber(tank.currentLevel != null ? tank.currentLevel / CRUISE_BURN_GPH : null)

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">

      <CrestHeader tailNumber={selectedAircraft?.tail_number} />

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

      <div className="px-4 pb-6 pt-4 space-y-5">

        {/* ── One card: vitals grid on top, status rows below ── */}
        <div className="trow-group bg-navy-800">

          <div className="p-3 space-y-2.5">

            {/* Hobbs — the account balance */}
            <button className="vital-tile w-full items-center py-5" onClick={() => setHobbsHistoryOpen(true)}>
              <p className="vital-label">Hobbs</p>
              <p className="vital-value tracking-tight" style={{ fontSize: 42 }}>
                {animHobbs != null
                  ? animHobbs.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                  : '—'} <span className="vital-unit" style={{ fontSize: 18 }}>h</span>
              </p>
              <p className="vital-sub">
                {stats.total ? `+${stats.allHours ?? stats.monthHours} this month` : 'No flights yet'}
              </p>
            </button>

            {/* Secondary stats */}
            <div className="grid grid-cols-3 gap-2.5">
              <button className="vital-tile" onClick={() => navigate('/maintenance')}>
                <p className="vital-label">Maint</p>
                {overdueCount > 0 ? (
                  <p className="vital-value-sm text-red-400">{overdueCount} <span className="vital-unit">over</span></p>
                ) : dueSoonCount > 0 ? (
                  <p className="vital-value-sm text-amber-300">{dueSoonCount} <span className="vital-unit">soon</span></p>
                ) : (
                  <p className="vital-value-sm">OK</p>
                )}
                <p className="vital-sub">{nextDue ? `next ${nextDue.hrsRemaining.toFixed(1)} h` : '—'}</p>
              </button>

              <button className="vital-tile" onClick={() => navigate('/fuel')}>
                <p className="vital-label">Fuel</p>
                <p className="vital-value-sm">
                  {animFuel != null ? Math.round(animFuel) : '—'} <span className="vital-unit">gal</span>
                </p>
                <div className="h-1 rounded-full bg-white/[0.08] overflow-hidden mt-2 w-full">
                  <div className="h-full rounded-full bg-accent transition-all duration-700"
                    style={{ width: `${(tank.fillPercent ?? 0) * 100}%` }} />
                </div>
              </button>

              <button className="vital-tile" onClick={() => navigate('/fuel')}>
                <p className="vital-label">Endur</p>
                <p className="vital-value-sm">
                  {animEndurance != null ? animEndurance.toFixed(1) : '—'} <span className="vital-unit">h</span>
                </p>
                <p className="vital-sub">{CRUISE_BURN_GPH} gph</p>
              </button>
            </div>
          </div>

          <button className="trow" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            onClick={() => navigate('/flights')}>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white">Flights</p>
              <p className="text-[12px] text-white/40 mt-0.5">
                {stats.total ? `${stats.allHours ?? stats.monthHours} this month · ${stats.total} flights` : 'No flights yet'}
                {lastFlight && ` · last ${formatDate(lastFlight.date)}`}
              </p>
            </div>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="chev w-4 h-4 ml-auto"><path d="M9 18l6-6-6-6" /></svg>
          </button>

          <button className="trow" onClick={() => navigate('/map')}>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white">Map &amp; Waypoints</p>
              <p className="text-[12px] text-white/40 mt-0.5">275 aerodromes · hold to add your own sites</p>
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
