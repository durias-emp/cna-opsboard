import { useEffect, useMemo, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { toHobbs, formatDate } from '../lib/utils'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { useWaypoints } from '../hooks/useWaypoints'
import { loadStyle } from '../lib/mapStyle'
import { HELICOPTER_ICON } from '../assets/navIcons'

// Static minimap of the route flown — same teal line the live map uses.
export function RouteMiniMap({ coords }) {
  const boxRef = useRef(null)
  useEffect(() => {
    let map, cancelled = false
    loadStyle().then(style => {
      if (cancelled) return
      map = new maplibregl.Map({
        container: boxRef.current, style,
        center: coords[0], zoom: 9,
        interactive: false, attributionControl: false,
      })
      map.on('load', () => {
        map.addSource('trip', { type: 'geojson', data: { type: 'FeatureCollection', features: [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
          ...coords.map(c => (
            { type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })),
        ] } })
        map.addLayer({
          id: 'trip-line', type: 'line', source: 'trip',
          filter: ['==', ['geometry-type'], 'LineString'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#2CB9BD', 'line-width': 3, 'line-opacity': 0.9 },
        })
        map.addLayer({
          id: 'trip-pts', type: 'circle', source: 'trip',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 4.5, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#2CB9BD', 'circle-stroke-width': 2.5 },
        })
        const b = new maplibregl.LngLatBounds()
        coords.forEach(c => b.extend(c))
        try { map.fitBounds(b, { padding: 36, maxZoom: 11, duration: 0 }) } catch { /* degenerate bounds */ }
      })
    })
    return () => { cancelled = true; map?.remove() }
  }, [coords])
  return (
    <div className="relative rounded-2xl overflow-hidden" style={{ height: 170 }}>
      {/* position/inset inline — maplibre-gl.css sets position:relative on this
          node and out-cascades the Tailwind class, collapsing it to 0 height */}
      <div ref={boxRef} style={{ position: 'absolute', inset: 0, isolation: 'isolate', background: '#EAE6DE' }} />
      {/* same dark veil the dashboard minimap wears */}
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(14,16,18,0.30)' }} />
    </div>
  )
}

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
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  const { waypoints } = useWaypoints()

  // Resolve the flight's legs to chart coordinates (same matching the map's
  // Trips view uses); older flights whose names don't match simply show no map
  const routeCoords = useMemo(() => {
    const find = name => {
      if (!name) return null
      const n = String(name).trim().toUpperCase()
      return waypoints.find(w => (w.code ?? '').toUpperCase() === n)
          ?? waypoints.find(w => w.name.toUpperCase().includes(n))
    }
    const coords = []
    const push = w => {
      if (!w) return
      const last = coords[coords.length - 1]
      if (!last || last[0] !== w.lng || last[1] !== w.lat) coords.push([w.lng, w.lat])
    }
    const chips = flight?.legs?.[0]?.route
    if (chips?.length >= 2) {
      for (const c of chips) push(find(c))   // the logged ROUTE chips are the authority
    } else {
      for (const leg of flight?.legs ?? []) {
        push(find(leg.takeoff_location))
        for (const v of leg.via ?? []) push(find(v))
        push(find(leg.landing_location))
      }
    }
    return coords.length >= 2 ? coords : null
  }, [flight, waypoints])

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
        className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div
        className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={panelStyle} {...panelProps}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
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

          {/* Route flown */}
          {open && routeCoords && (
            <div>
              <p className="label mb-3">Route</p>
              <RouteMiniMap coords={routeCoords} />
            </div>
          )}

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
                        <img src={HELICOPTER_ICON} alt=""
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
