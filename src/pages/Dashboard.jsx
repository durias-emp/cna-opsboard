import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMotionValue, animate } from 'framer-motion'
import { toHobbs, formatDate } from '../lib/utils'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import CrestHeader from '../components/CrestHeader'
import HobbsHistoryDrawer from '../components/HobbsHistoryDrawer'
import { useTank } from '../hooks/useTank'

// YS-CNA cruise burn (owner-provided, also used for quoting)
const CRUISE_BURN_GPH = 27
// Bell 206B3 POH: total fuel capacity 96.7 USG. Low-fuel caution ~20 gal.
const FUEL_CAP_GAL = 96.7
const FUEL_LOW_GAL = 20

// Garmin-style arc gauge: gray track, colored sweep, needle, digital readout
function FuelArc({ gal }) {
  const f = Math.min(Math.max((gal ?? 0) / FUEL_CAP_GAL, 0), 1)
  const rad = Math.PI * (1 - f)
  const nx = 40 + 26 * Math.cos(rad)
  const ny = 42 - 26 * Math.sin(rad)
  const low = gal != null && gal <= FUEL_LOW_GAL
  const sweep = low ? '#FBBF24' : '#4ADE50'
  return (
    <svg viewBox="0 0 80 48" className="w-full" style={{ maxWidth: '5.4rem' }}>
      <path d="M 8 42 A 32 32 0 0 1 72 42" fill="none"
        stroke="rgba(255,255,255,0.09)" strokeWidth="6" strokeLinecap="butt" />
      <path d="M 8 42 A 32 32 0 0 1 72 42" fill="none"
        stroke={sweep} strokeWidth="6" strokeLinecap="butt"
        strokeDasharray={`${f * 100.5} 999`}
        style={{ transition: 'stroke-dasharray 0.3s linear' }} />
      <line x1="40" y1="42" x2={nx} y2={ny} stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="40" cy="42" r="2.6" fill="#fff" />
    </svg>
  )
}

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



export default function Dashboard() {
  const { selectedAircraft } = useAircraft()
  const { flights, stats, fuelStats, refresh } = useFlights(selectedAircraft?.id)
  const maintItems = useMaintenanceItems(selectedAircraft?.id, selectedAircraft?.hobbs_current, selectedAircraft?.cycles_current)
  const navigate = useNavigate()
  const [hobbsHistoryOpen,    setHobbsHistoryOpen]    = useState(false)
  const tank = useTank()

  const hobbs   = selectedAircraft?.hobbs_current
  const cycles  = selectedAircraft?.cycles_current
  const recentFlights = flights.slice(0, 4)

  const overdueCount = maintItems.overdue.length
  const dueSoonCount = maintItems.dueSoon.length
  const nextDue = maintItems.items
    .filter(i => i.hrsRemaining != null && i.hrsRemaining > 0)
    .sort((a, b) => a.hrsRemaining - b.hrsRemaining)[0] ?? null
  const lastFlight = flights[0] ?? null

  // Fuel inside the aircraft = gauge reading at the end of the last flight
  const onboardFuel = lastFlight?.fuel_end_gal ?? null

  const animHobbs     = useAnimatedNumber(hobbs)
  const animFuel      = useAnimatedNumber(onboardFuel)
  const animEndurance = useAnimatedNumber(onboardFuel != null ? onboardFuel / CRUISE_BURN_GPH : null)

  return (
    <div className="flex-1 overflow-y-auto nav-clearance page-ambience">

      <CrestHeader />

      {/* ── Hero — the aircraft is the interface ── */}
      <button onClick={() => setHobbsHistoryOpen(true)} className="hero-stage block w-full select-none">
        <img src="/heli-hero.png" alt={selectedAircraft?.make_model ?? 'Bell 206B3 JetRanger'}
          className="hero-heli" draggable="false" />
      </button>

      <div className="px-4 pb-6 pt-4 space-y-5">

        {/* ── One card: vitals grid on top, status rows below ── */}
        <div className="trow-group glass-card">

          <div className="p-3 space-y-2.5">

            {/* Hobbs — the account balance */}
            <button className="vital-tile w-full items-center py-5" onClick={() => setHobbsHistoryOpen(true)}>
              <p className="vital-label">Hobbs</p>
              <p className="vital-value tracking-tight" style={{ fontSize: 42 }}>
                {animHobbs != null
                  ? animHobbs.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                  : '—'} <span className="vital-unit" style={{ fontSize: 18 }}>h</span>
              </p>
              {cycles != null && (
                <p className="vital-sub">
                  {cycles.toLocaleString()} cyc
                  {lastFlight?.cycles > 0 && (
                    <span className="text-green-400 font-semibold"> +{lastFlight.cycles}</span>
                  )}
                </p>
              )}
            </button>

            {/* Secondary stats — identical skeleton on all three tiles:
                label / fixed-height centerpiece / one-line footer */}
            <div className="grid grid-cols-3 gap-2.5">
              <button className="vital-tile items-center text-center" onClick={() => navigate('/maintenance')}>
                <p className="vital-label">Maint</p>
                <div className="vital-zone">
                  {overdueCount > 0 ? (
                    <p className="vital-value-sm text-red-400">
                      {overdueCount} <span className="vital-unit">over</span>
                    </p>
                  ) : dueSoonCount > 0 ? (
                    <p className="vital-value-sm text-amber-300">
                      {dueSoonCount} <span className="vital-unit">soon</span>
                    </p>
                  ) : (
                    <p className="vital-value-sm">OK</p>
                  )}
                </div>
                <p className="vital-foot">{nextDue ? `next ${nextDue.hrsRemaining.toFixed(1)} h` : '—'}</p>
              </button>

              <button className="vital-tile items-center text-center" onClick={() => navigate('/fuel')}>
                <p className="vital-label">Fuel</p>
                <div className="vital-zone">
                  <FuelArc gal={animFuel} />
                  <p className="vital-value-sm" style={{ marginTop: '-0.3rem' }}>
                    {animFuel != null ? Math.round(animFuel) : '—'} <span className="vital-unit">USG</span>
                  </p>
                </div>
                <p className="vital-foot">
                  {animEndurance != null ? `${animEndurance.toFixed(1)} h endurance` : '—'}
                </p>
              </button>

              <button className="vital-tile items-center text-center" onClick={() => navigate('/flights')}>
                <p className="vital-label">Month</p>
                <div className="vital-zone">
                  <p className="vital-value-sm">
                    {stats.total ? `+${stats.allHours ?? stats.monthHours}` : '0h'}
                  </p>
                </div>
                <p className="vital-foot">{stats.total ? `${stats.total} flights` : 'no flights'}</p>
              </button>
            </div>
          </div>

          <button className="trow" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
            onClick={() => navigate('/map')}>
            <div className="min-w-0">
              <p className="text-[14px] font-semibold text-white">Map &amp; Waypoints</p>
              <p className="text-[12px] text-white/40 mt-0.5">275 aerodromes · hold to add your own sites</p>
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
            <div className="tile-group glass-card flex flex-col items-center justify-center py-8 gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/25">
                <IconFlight />
              </div>
              <p className="text-xs text-white/25">No flights yet</p>
            </div>
          ) : (
            <div className="tile-group glass-card">
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
