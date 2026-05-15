import { useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { useEmployeeFlights } from '../hooks/useEmployeeFlights'

const toHobbs = mins => Math.floor(mins / 6) / 10

function formatDate(iso) {
  if (!iso) return null
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function flightRoute(flight) {
  const first = flight.legs?.[0]
  const last  = flight.legs?.[flight.legs.length - 1]
  if (!first?.takeoff_location || !last?.landing_location) return '—'
  return `${first.takeoff_location} → ${last.landing_location}`
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function PilotCard({ pilot }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card p-0 overflow-hidden">
      {/* Main row */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 active:bg-white/[0.03] transition-colors text-left"
        onClick={() => setExpanded(v => !v)}
      >
        {/* Avatar */}
        <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-white/60">{initials(pilot.name)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">{pilot.name}</p>
          <p className="text-[11px] text-white/35 mt-0.5">
            {pilot.lastFlightDate ? `Last flew ${formatDate(pilot.lastFlightDate)}` : 'No flights logged'}
          </p>
        </div>
        {/* Stats */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-white">{pilot.totalHours.toFixed(1)}h</p>
            <p className="text-[9px] text-white/30 uppercase tracking-wide">Total</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-white">{pilot.monthHours.toFixed(1)}h</p>
            <p className="text-[9px] text-white/30 uppercase tracking-wide">This mo.</p>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" className={`w-4 h-4 text-white/20 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded flight history */}
      {expanded && (
        <div className="border-t border-white/[0.05]">
          {pilot.recentFlights.length === 0 ? (
            <p className="text-xs text-white/25 px-4 py-3 text-center">No flights logged yet</p>
          ) : (
            pilot.recentFlights.map((f, i) => (
              <div key={f.id}
                className={`flex items-center justify-between px-4 py-2.5 ${i < pilot.recentFlights.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
                <div>
                  <p className="text-xs font-medium text-white/70">{flightRoute(f)}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{formatDate(f.date)}</p>
                </div>
                <p className="text-xs text-white/40 flex-shrink-0 ml-3">
                  {f.total_minutes ? `${toHobbs(f.total_minutes).toFixed(1)}h` : '—'}
                </p>
              </div>
            ))
          )}
          {pilot.flightCount > 5 && (
            <p className="text-[10px] text-white/20 text-center py-2">
              +{pilot.flightCount - 5} more flights
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function MechanicCard({ mechanic }) {
  return (
    <div className="card flex items-center gap-3 py-3.5">
      <div className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-white/60">{initials(mechanic.name)}</span>
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{mechanic.name}</p>
        <p className="text-[11px] text-white/35 mt-0.5">{mechanic.role}</p>
      </div>
    </div>
  )
}

export default function Employees() {
  const { selectedAircraft } = useAircraft()
  const { pilots, mechanics, loading } = useEmployeeFlights(selectedAircraft?.id)

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">
      <div className="px-4 pt-5 pb-2">
        <h1 className="page-title">Team</h1>
        <p className="text-xs text-white/40 mt-0.5">
          {selectedAircraft?.tail_number} · Cielo Norte Aviación
        </p>
      </div>

      <div className="px-4 pb-6 space-y-6">

        {/* Pilots */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="label">Pilots</p>
            <p className="text-[10px] text-white/25">{pilots.length} active</p>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="card h-14 animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {pilots.map(p => <PilotCard key={p.name} pilot={p} />)}
            </div>
          )}
        </div>

        {/* Mechanics */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="label">Mechanics</p>
            <p className="text-[10px] text-white/25">{mechanics.length} active</p>
          </div>
          <div className="space-y-3">
            {mechanics.map(m => <MechanicCard key={m.name} mechanic={m} />)}
          </div>
        </div>

      </div>
    </div>
  )
}
