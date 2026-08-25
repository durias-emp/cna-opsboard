import { toHobbs, formatDate } from '../lib/utils'

function flightRoute(flight) {
  const first = flight.legs?.[0]
  const last = flight.legs?.[flight.legs.length - 1]
  if (!first?.takeoff_location || !last?.landing_location) return '\u2014'
  return `${first.takeoff_location} \u2192 ${last.landing_location}`
}

function formatDuration(mins) {
  if (!mins) return '\u2014'
  return `${toHobbs(mins).toFixed(1)}h`
}

// Read-only flight detail bottom sheet, shared by the Flights page and the
// dashboard's Recent-flights shortcuts.
export default function FlightDetailSheet({ flight, open, onClose }) {
  if (!flight) return null

  const legs = flight.legs ?? []
  const consumed    = flight.fuel_consumed_gal
    ?? (flight.fuel_start_gal != null && flight.fuel_end_gal != null
        ? Math.round((flight.fuel_start_gal - flight.fuel_end_gal) * 100) / 100
        : null)
  const hasFuel     = consumed != null || flight.fuel_start_gal != null
  const galPerHour  = consumed != null && flight.total_minutes > 0
    ? Math.round((consumed / (flight.total_minutes / 60)) * 100) / 100
    : null

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`fixed bottom-0 left-0 right-0 z-[70] bg-navy-900 rounded-t-3xl
          transition-transform duration-300 ease-out
          ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '88dvh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">{flightRoute(flight)}</h2>
            <p className="text-[11px] text-white/35 mt-0.5">{formatDate(flight.date)}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white/60">{formatDuration(flight.total_minutes)}</span>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center text-white/50 flex-shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 pb-6 space-y-4">

          {/* Legs */}
          <div>
            <p className="label mb-3">{legs.length > 1 ? `${legs.length} Legs` : 'Flight leg'}</p>
            <div className="space-y-2">
              {legs.map((leg, i) => (
                <div key={i} className="bg-white/[0.04] rounded-2xl p-4">
                  {legs.length > 1 && (
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-3">Leg {i + 1}</p>
                  )}
                  <div className="flex items-center gap-3">
                    {/* From */}
                    <div className="text-center">
                      <p className="text-lg font-bold text-white tracking-widest">{leg.takeoff_location || '—'}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">{leg.takeoff_time || '—'}</p>
                    </div>
                    {/* Arrow */}
                    <div className="flex-1 flex flex-col items-center gap-1">
                      <div className="flex items-center w-full gap-1">
                        <div className="flex-1 border-t border-dashed border-white/15" />
                        <img src="/helicopter.png" alt=""
                          className="w-4 h-4 object-contain opacity-20"
                          style={{ filter: 'brightness(0) invert(1)' }} />
                        <div className="flex-1 border-t border-dashed border-white/15" />
                      </div>
                      {leg.takeoff_time && leg.landing_time && (
                        <p className="text-[10px] text-white/25">
                          {formatDuration(
                            (() => {
                              const [th, tm] = leg.takeoff_time.split(':').map(Number)
                              const [lh, lm] = leg.landing_time.split(':').map(Number)
                              const diff = (lh * 60 + lm) - (th * 60 + tm)
                              return diff > 0 ? diff : diff + 1440
                            })()
                          )}
                        </p>
                      )}
                    </div>
                    {/* To */}
                    <div className="text-center">
                      <p className="text-lg font-bold text-white tracking-widest">{leg.landing_location || '—'}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">{leg.landing_time || '—'}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pilot */}
          {flight.pilot && (
            <div>
              <p className="label mb-3">Pilot</p>
              <div className="bg-white/[0.04] rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-white">{flight.pilot}</p>
              </div>
            </div>
          )}

          {/* Passengers */}
          {flight.passengers?.length > 0 && (
            <div>
              <p className="label mb-3">Passenger manifest</p>
              <div className="bg-white/[0.04] rounded-2xl overflow-hidden">
                {flight.passengers.map((p, i) => (
                  <div key={i}
                    className={`flex items-center justify-between px-4 py-3
                      ${i < flight.passengers.length - 1 ? 'border-b border-white/[0.05]' : ''}`}>
                    <p className="text-sm font-semibold text-white">{p.name}</p>
                    {p.weight_lbs != null && (
                      <p className="text-xs text-white/40">{p.weight_lbs} lb</p>
                    )}
                  </div>
                ))}
                {/* Total weight */}
                {flight.passengers.some(p => p.weight_lbs != null) && (
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.05] bg-white/[0.02]">
                    <p className="label">Total weight</p>
                    <p className="text-xs font-bold text-white">
                      {flight.passengers.reduce((s, p) => s + (p.weight_lbs ?? 0), 0)} lb
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fuel */}
          {hasFuel && (
            <div>
              <p className="label mb-3">Fuel</p>
              <div className="bg-white/[0.04] rounded-2xl p-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="label mb-1">Start</p>
                    <p className="text-lg font-bold text-white leading-none">
                      {flight.fuel_start_gal}<span className="text-xs text-white/40 font-normal ml-1">gal</span>
                    </p>
                  </div>
                  <div>
                    <p className="label mb-1">End</p>
                    <p className="text-lg font-bold text-white leading-none">
                      {flight.fuel_end_gal}<span className="text-xs text-white/40 font-normal ml-1">gal</span>
                    </p>
                  </div>
                  <div>
                    <p className="label mb-1">Consumed</p>
                    <p className="text-lg font-bold text-white leading-none">
                      {consumed}<span className="text-xs text-white/40 font-normal ml-1">gal</span>
                    </p>
                  </div>
                  {galPerHour != null && (
                    <div>
                      <p className="label mb-1">Rate</p>
                      <p className="text-lg font-bold text-white leading-none">
                        {galPerHour}<span className="text-xs text-white/40 font-normal ml-1">gal/h</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          {flight.notes && (
            <div>
              <p className="label mb-3">Notes</p>
              <div className="bg-white/[0.04] rounded-2xl px-4 py-3">
                <p className="text-sm text-white/70 leading-relaxed">{flight.notes}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}
