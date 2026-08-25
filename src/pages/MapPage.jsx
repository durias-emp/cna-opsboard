import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useWaypoints } from '../hooks/useWaypoints'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import { formatDMS, haversineNm } from '../lib/geo'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { loadStyle, SALVADOR_CENTER } from '../lib/mapStyle'

const LONG_PRESS_MS = 450

const toFeature = w => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
  properties: { id: w.id, code: w.code ?? '', name: w.name, kind: w.kind },
})
const fc = list => ({ type: 'FeatureCollection', features: list.map(toFeature) })

// ── Ops workspace ──
const AVIARA_URL = 'https://aviara-app.vercel.app'   // sister app: flight planning
// YS-CNA quoting parameters (owner-provided)
const CRUISE_KTS = 100
const BURN_GPH   = 27
const RATE_HR    = 1350

const glassBtn = {
  background: 'rgba(30,30,32,0.55)', backdropFilter: 'blur(24px) saturate(180%)',
  WebkitBackdropFilter: 'blur(24px) saturate(180%)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 0.5px rgba(255,255,255,0.08)',
}

const INTRO_KEY = 'cna:mapIntro'          // sessionStorage: intro flight once per session
const LAYERS_KEY = 'cna:mapLayers'        // localStorage: AVIARA-style layer visibility

function loadLayerPrefs() {
  try {
    const v = JSON.parse(localStorage.getItem(LAYERS_KEY))
    if (v && typeof v === 'object') return { aip: !!v.aip, custom: v.custom !== false }
  } catch { /* shipped defaults */ }
  return { aip: false, custom: true }     // aerodromes OFF by default (AVIARA layers)
}

export default function MapPage() {
  const navigate = useNavigate()
  const { waypoints, dbReady, addWaypoint, deactivateWaypoint } = useWaypoints()
  const [selected, setSelected] = useState(null)
  const [draft,    setDraft]    = useState(null)
  const [ready,    setReady]    = useState(false)
  const [layers,   setLayers]   = useState(loadLayerPrefs)
  const [layersOpen, setLayersOpen] = useState(false)
  const layersRef = useRef(layers)
  layersRef.current = layers

  // Ops card: 'menu' launcher → 'quote' (tap-to-route) / 'trips' / 'trip-view'
  const [mode, setMode] = useState('menu')
  const modeRef = useRef(mode)
  modeRef.current = mode
  const [routePoints, setRoutePoints] = useState([])     // quote route, in tap order
  const [trip, setTrip] = useState(null)                 // selected past flight
  const animRef = useRef(null)                           // breadcrumb rAF id

  const { selectedAircraft } = useAircraft()
  const { flights } = useFlights(selectedAircraft?.id)

  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const waypointsRef = useRef(waypoints)
  waypointsRef.current = waypoints

  const aip     = useMemo(() => waypoints.filter(w => w.source === 'aip'), [waypoints])
  const customs = useMemo(() => waypoints.filter(w => w.source !== 'aip'), [waypoints])

  // ── Map lifecycle ──
  useEffect(() => {
    let map, cancelled = false
    loadStyle().then(style => {
      if (cancelled) return
      // First map open of the session: start on the whole globe and fly in
      const playIntro = !sessionStorage.getItem(INTRO_KEY)
      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: playIntro ? [-70, 18] : SALVADOR_CENTER,
        zoom: playIntro ? 1.1 : 8.5,
        attributionControl: { compact: true },
      })
      mapRef.current = map
      if (import.meta.env.DEV) window.__map = map

      // AVIARA's 3D globe: re-apply on every style load (setStyle resets it)
      map.on('style.load', () => map.setProjection({ type: 'globe' }))

      // Attribution stays (OSM license requires it) but collapsed to the ⓘ —
      // MapLibre auto-expands it on load, so fold it back immediately
      map.once('load', () => {
        containerRef.current?.querySelector('.maplibregl-ctrl-attrib')
          ?.classList.remove('maplibregl-compact-show')
      })

      map.on('load', () => {
        map.addSource('aip',    { type: 'geojson', data: fc([]) })
        map.addSource('custom', { type: 'geojson', data: fc([]) })

        map.addLayer({
          id: 'aip-dots', type: 'circle', source: 'aip',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'kind'], 'heliport'], 3.5, 4.5],
            'circle-color': '#5B616B',
            'circle-stroke-color': '#9BA1A8',
            'circle-stroke-width': 1.2,
            'circle-opacity': 0.9,
          },
        })
        map.addLayer({
          id: 'aip-labels', type: 'symbol', source: 'aip',
          minzoom: 7.5,
          layout: {
            'text-field': ['coalesce', ['get', 'code'], ''],
            'text-font': ['Noto Sans Regular'],
            'text-size': 10,
            'text-offset': [0, 1.1],
            'text-anchor': 'top',
          },
          paint: { 'text-color': 'rgba(255,255,255,0.45)' },
        })
        map.addLayer({
          id: 'custom-dots', type: 'circle', source: 'custom',
          paint: {
            'circle-radius': 6,
            'circle-color': '#2CB9BD',
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2,
          },
        })
        map.addLayer({
          id: 'custom-labels', type: 'symbol', source: 'custom',
          minzoom: 6,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Regular'],
            'text-size': 11,
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
          },
          paint: { 'text-color': '#56D3D6' },
        })

        // Ops overlays: quote/trip route line + points + breadcrumb dot
        map.addSource('route', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'route-line', type: 'line', source: 'route',
          filter: ['==', ['geometry-type'], 'LineString'],
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#2CB9BD', 'line-width': 3, 'line-opacity': 0.9 },
        })
        map.addLayer({
          id: 'route-pts', type: 'circle', source: 'route',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: { 'circle-radius': 5, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#2CB9BD', 'circle-stroke-width': 2.5 },
        })
        map.addSource('crumb', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'crumb-dot', type: 'circle', source: 'crumb',
          paint: { 'circle-radius': 7, 'circle-color': '#2CB9BD', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 },
        })

        // AVIARA layers: apply saved visibility (aerodromes hidden by default)
        const vis = layersRef.current
        for (const id of ['aip-dots', 'aip-labels'])
          map.setLayoutProperty(id, 'visibility', vis.aip ? 'visible' : 'none')
        for (const id of ['custom-dots', 'custom-labels'])
          map.setLayoutProperty(id, 'visibility', vis.custom ? 'visible' : 'none')

        // Intro flight: whole globe → dive onto the region, once per session
        if (playIntro) {
          sessionStorage.setItem(INTRO_KEY, '1')
          setTimeout(() => {
            map.flyTo({ center: SALVADOR_CENTER, zoom: 8.5, duration: 3200, curve: 1.42, essential: true })
          }, 450)
        }

        setReady(true)
      })

      // Tap a marker → detail sheet, or extend the route while quoting
      const pick = e => {
        const f = e.features?.[0]
        if (!f) return
        const w = waypointsRef.current.find(x => String(x.id) === String(f.properties.id))
        if (!w) return
        if (modeRef.current === 'quote') {
          setRoutePoints(ps => (ps[ps.length - 1]?.id === w.id ? ps : [...ps, w]))
        } else {
          setSelected(w)
        }
      }
      map.on('click', 'aip-dots', pick)
      map.on('click', 'custom-dots', pick)
      map.on('mouseenter', 'aip-dots',    () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'aip-dots',    () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'custom-dots', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'custom-dots', () => { map.getCanvas().style.cursor = '' })

      // Desktop right-click → new waypoint
      map.on('contextmenu', e => { if (modeRef.current === 'menu') setDraft({ lat: e.lngLat.lat, lng: e.lngLat.lng }) })

      // Mobile long-press → new waypoint (MapLibre has no touch contextmenu)
      let pressTimer = null, pressAt = null
      map.on('touchstart', e => {
        if (e.originalEvent.touches.length !== 1) return
        if (modeRef.current !== 'menu') return   // no waypoint drafts mid-quote/trip
        pressAt = e.lngLat
        pressTimer = setTimeout(() => setDraft({ lat: pressAt.lat, lng: pressAt.lng }), LONG_PRESS_MS)
      })
      const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null }
      map.on('touchmove', cancelPress)
      map.on('touchend', cancelPress)
      map.on('move', cancelPress)
    })

    return () => { cancelled = true; mapRef.current = null; map?.remove() }
  }, [])

  // ── Quote math: live numbers from the tapped route ──
  const quote = useMemo(() => {
    if (routePoints.length < 2) return null
    let nm = 0
    for (let i = 1; i < routePoints.length; i++)
      nm += haversineNm(routePoints[i - 1].lat, routePoints[i - 1].lng, routePoints[i].lat, routePoints[i].lng)
    const hours = nm / CRUISE_KTS
    return {
      nm,
      hours,
      fuel: hours * BURN_GPH,
      price: hours * RATE_HR,
    }
  }, [routePoints])

  // ── Draw the quote route + fit the camera ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const feats = routePoints.map(w => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [w.lng, w.lat] }, properties: {},
    }))
    if (routePoints.length >= 2) {
      feats.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: routePoints.map(w => [w.lng, w.lat]) },
        properties: {},
      })
    }
    map.getSource('route')?.setData({ type: 'FeatureCollection', features: feats })
    if (routePoints.length >= 2) {
      const b = new maplibregl.LngLatBounds()
      routePoints.forEach(w => b.extend([w.lng, w.lat]))
      map.fitBounds(b, { padding: { top: 120, left: 60, right: 60, bottom: 300 }, maxZoom: 10, duration: 700 })
    }
  }, [routePoints, ready])

  // ── Trips: resolve a flight's legs to waypoints, draw, and fly the crumb ──
  function resolveTrip(flight) {
    const find = name => {
      if (!name) return null
      const n = String(name).trim().toUpperCase()
      return waypointsRef.current.find(w => (w.code ?? '').toUpperCase() === n)
          ?? waypointsRef.current.find(w => w.name.toUpperCase().includes(n))
    }
    const coords = []
    for (const leg of flight.legs ?? []) {
      const a = find(leg.takeoff_location), b = find(leg.landing_location)
      if (a && !coords.length) coords.push([a.lng, a.lat])
      if (a && coords.length && (coords[coords.length - 1][0] !== a.lng)) coords.push([a.lng, a.lat])
      if (b) coords.push([b.lng, b.lat])
    }
    return coords.length >= 2 ? coords : null
  }

  function showTrip(flight) {
    const coords = resolveTrip(flight)
    setTrip({ flight, coords })
    setMode('trip-view')
    const map = mapRef.current
    if (!map || !ready) return
    cancelAnimationFrame(animRef.current)
    if (!coords) {
      map.getSource('route')?.setData({ type: 'FeatureCollection', features: [] })
      map.getSource('crumb')?.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const b = new maplibregl.LngLatBounds()
    coords.forEach(c => b.extend(c))
    map.fitBounds(b, { padding: { top: 120, left: 60, right: 60, bottom: 300 }, maxZoom: 10.5, duration: 700 })

    // Breadcrumb: the line draws itself and a dot flies it (~3.5 s)
    const seg = []
    let total = 0
    for (let i = 1; i < coords.length; i++) {
      const d = Math.hypot(coords[i][0] - coords[i - 1][0], coords[i][1] - coords[i - 1][1])
      seg.push(d); total += d
    }
    const t0 = performance.now()
    const DUR = 3500
    const step = now => {
      const p = Math.min((now - t0) / DUR, 1)
      let dist = p * total, drawn = [coords[0]]
      let pos = coords[0]
      for (let i = 1; i < coords.length; i++) {
        if (dist >= seg[i - 1]) { drawn.push(coords[i]); dist -= seg[i - 1]; pos = coords[i] }
        else {
          const f = seg[i - 1] ? dist / seg[i - 1] : 1
          pos = [coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * f,
                 coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * f]
          drawn.push(pos)
          break
        }
      }
      map.getSource('route')?.setData({ type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'LineString', coordinates: drawn }, properties: {} },
        ...[coords[0], coords[coords.length - 1]].map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })),
      ] })
      map.getSource('crumb')?.setData({ type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: pos }, properties: {} },
      ] })
      if (p < 1) animRef.current = requestAnimationFrame(step)
    }
    animRef.current = requestAnimationFrame(step)
  }

  // ── Leaving a mode clears the overlays; quote mode shows every waypoint ──
  function exitToMenu() {
    cancelAnimationFrame(animRef.current)
    setRoutePoints([]); setTrip(null); setMode('menu')
    const map = mapRef.current
    if (map && ready) {
      map.getSource('route')?.setData({ type: 'FeatureCollection', features: [] })
      map.getSource('crumb')?.setData({ type: 'FeatureCollection', features: [] })
    }
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    // While quoting, every site must be tappable regardless of layer prefs
    if (mode === 'quote') {
      for (const id of ['aip-dots', 'aip-labels', 'custom-dots', 'custom-labels'])
        map.setLayoutProperty(id, 'visibility', 'visible')
    } else {
      for (const id of ['aip-dots', 'aip-labels'])
        map.setLayoutProperty(id, 'visibility', layers.aip ? 'visible' : 'none')
      for (const id of ['custom-dots', 'custom-labels'])
        map.setLayoutProperty(id, 'visibility', layers.custom ? 'visible' : 'none')
    }
  }, [mode, ready])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── AVIARA layers: visibility follows the toggles, persisted ──
  useEffect(() => {
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)) } catch { /* ok */ }
    const map = mapRef.current
    if (!map || !ready) return
    for (const id of ['aip-dots', 'aip-labels'])
      map.setLayoutProperty(id, 'visibility', layers.aip ? 'visible' : 'none')
    for (const id of ['custom-dots', 'custom-labels'])
      map.setLayoutProperty(id, 'visibility', layers.custom ? 'visible' : 'none')
  }, [layers, ready])

  // ── Keep sources in sync with waypoint data ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.getSource('aip')?.setData(fc(aip))
    map.getSource('custom')?.setData(fc(customs))
  }, [aip, customs, ready])

  return (
    <div className="flex-1 relative">
      {/* isolation: keeps the map's stacking inside this box so app overlays
          (sheets, identity, action sheets) always paint above it */}
      {/* position/inset are inline because maplibre-gl.css sets
          .maplibregl-map { position: relative } on this node at init, which
          out-cascades the Tailwind class and collapses the box to 0 height */}
      <div ref={containerRef} className="z-0"
        style={{ position: 'absolute', inset: 0, isolation: 'isolate', background: '#171717' }} />

      {/* Floating back button + hint + layers */}
      <div className="absolute top-0 left-0 right-0 z-10 flex items-center gap-3 px-4"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
        <button onClick={() => navigate(-1)} aria-label="Back"
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0
                     active:scale-95 transition-transform"
          style={{ background: 'rgba(30,30,32,0.55)', backdropFilter: 'blur(24px) saturate(180%)',
                   WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                   boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 0.5px rgba(255,255,255,0.08)' }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}
            strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 -ml-0.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="rounded-2xl px-3.5 py-2 pointer-events-none"
          style={{ background: 'rgba(var(--glass-rgb), calc(var(--glass-opacity) + 0.3))', backdropFilter: 'blur(var(--glass-blur)) saturate(180%)', WebkitBackdropFilter: 'blur(var(--glass-blur)) saturate(180%)' }}>
          <p className="text-[11px] text-white/45 leading-none">Hold anywhere to add a waypoint</p>
        </div>

        {/* Layers — AVIARA system: what draws on the chart is a choice */}
        <div className="relative ml-auto flex-shrink-0">
          <button onClick={() => setLayersOpen(o => !o)} aria-label="Map layers"
            className="w-11 h-11 rounded-full flex items-center justify-center
                       active:scale-95 transition-transform"
            style={{ background: 'rgba(30,30,32,0.55)', backdropFilter: 'blur(24px) saturate(180%)',
                     WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                     boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 0.5px rgba(255,255,255,0.08)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.9}
              strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          </button>

          {layersOpen && (
            <div className="absolute right-0 top-[3.2rem] rounded-2xl overflow-hidden min-w-[12.5rem]"
              style={{ background: 'rgba(37,37,40,0.60)', backdropFilter: 'blur(50px) saturate(210%)',
                       WebkitBackdropFilter: 'blur(50px) saturate(210%)',
                       border: '0.5px solid rgba(255,255,255,0.12)',
                       boxShadow: '0 16px 48px rgba(0,0,0,0.55)' }}>
              {[
                { key: 'aip',    label: 'Aerodromes',   sub: '275 CA-4 sites' },
                { key: 'custom', label: 'My waypoints', sub: 'saved sites' },
              ].map(({ key, label, sub }, i) => (
                <button key={key}
                  onClick={() => setLayers(l => ({ ...l, [key]: !l[key] }))}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left
                              active:bg-white/[0.08] ${i > 0 ? 'border-t border-white/[0.08]' : ''}`}>
                  <span>
                    <span className="block text-[15px] text-white leading-none">{label}</span>
                    <span className="block text-[11px] text-white/40 mt-1 leading-none">{sub}</span>
                  </span>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0
                    ${layers[key] ? 'bg-accent' : 'bg-white/[0.12]'}`}>
                    {layers[key] && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="#0c2a2b" strokeWidth={3}
                        strokeLinecap="round" className="w-3 h-3"><path d="M20 6L9 17l-5-5" /></svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Ops card — floating context card at the bottom ── */}
      <div className="absolute left-3 right-3 z-10 rounded-3xl overflow-hidden"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.8rem)',
                 background: 'rgba(30,30,32,0.62)', backdropFilter: 'blur(40px) saturate(200%)',
                 WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                 border: '0.5px solid rgba(255,255,255,0.10)',
                 boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>

        {mode === 'menu' && (
          <div className="grid grid-cols-3">
            {[
              { label: 'Flight plan', sub: 'AVIARA', onClick: () => window.open(AVIARA_URL, '_blank'),
                icon: <path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /> },
              { label: 'Quote', sub: 'price a trip', onClick: () => { setRoutePoints([]); setMode('quote') },
                icon: <><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></> },
              { label: 'Trips', sub: 'past flights', onClick: () => setMode('trips'),
                icon: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h6.5a3.5 3.5 0 0 0 0-7h-5a3.5 3.5 0 0 1 0-7H16" /></> },
            ].map(({ label, sub, onClick, icon }, i) => (
              <button key={label} onClick={onClick}
                className={`flex flex-col items-center gap-1.5 py-4 active:bg-white/[0.08] ${i > 0 ? 'border-l border-white/[0.07]' : ''}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#2CB9BD" strokeWidth={1.8}
                  strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">{icon}</svg>
                <span className="text-[13px] font-semibold text-white leading-none">{label}</span>
                <span className="text-[10px] text-white/35 leading-none">{sub}</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'quote' && (
          <div className="px-4 pt-3.5 pb-4">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[15px] font-bold text-white">Quote</p>
              <div className="flex gap-2">
                {routePoints.length > 0 && (
                  <button onClick={() => setRoutePoints([])}
                    className="text-[12px] font-semibold text-white/50 px-3 py-1.5 rounded-full bg-white/[0.08] active:bg-white/[0.15]">Clear</button>
                )}
                <button onClick={exitToMenu}
                  className="text-[12px] font-semibold text-white px-3 py-1.5 rounded-full bg-white/[0.08] active:bg-white/[0.15]">Done</button>
              </div>
            </div>
            {routePoints.length === 0 ? (
              <p className="text-[12px] text-white/40">Tap sites on the chart in order to build the route.</p>
            ) : (
              <>
                <p className="text-[12px] text-accent font-semibold mb-2.5 leading-snug">
                  {routePoints.map(w => w.code || w.name).join(' → ')}
                </p>
                {quote ? (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      ['Distance', `${quote.nm.toFixed(0)} nm`],
                      ['Time', `${quote.hours.toFixed(1)} h`],
                      ['Fuel', `${quote.fuel.toFixed(0)} gal`],
                      ['Price', `$${Math.round(quote.price).toLocaleString('en-US')}`],
                    ].map(([k, v]) => (
                      <div key={k} className="rounded-xl bg-white/[0.06] py-2.5">
                        <p className="text-[9px] uppercase tracking-wider text-white/35">{k}</p>
                        <p className="text-[14px] font-bold text-white mt-1 tabular-nums">{v}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-white/40">Tap the next site to complete the leg.</p>
                )}
                <p className="text-[9.5px] text-white/25 mt-2.5">
                  {CRUISE_KTS} kts cruise · {BURN_GPH} gph · ${RATE_HR.toLocaleString()}/h all-in · direct legs
                </p>
              </>
            )}
          </div>
        )}

        {mode === 'trips' && (
          <div className="px-4 pt-3.5 pb-2">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[15px] font-bold text-white">Trips</p>
              <button onClick={exitToMenu}
                className="text-[12px] font-semibold text-white px-3 py-1.5 rounded-full bg-white/[0.08] active:bg-white/[0.15]">Done</button>
            </div>
            <div className="max-h-48 overflow-y-auto -mx-1 px-1 pb-2">
              {flights.slice(0, 8).map(f => (
                <button key={f.id} onClick={() => showTrip(f)}
                  className="w-full flex items-center justify-between py-2.5 border-b border-white/[0.06] last:border-0 active:bg-white/[0.06] rounded-lg px-1 text-left">
                  <span>
                    <span className="block text-[13px] font-semibold text-white leading-none">
                      {f.legs?.[0]?.takeoff_location ?? '—'} → {f.legs?.[f.legs.length - 1]?.landing_location ?? '—'}
                    </span>
                    <span className="block text-[11px] text-white/40 mt-1 leading-none">
                      {new Date(f.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </span>
                  <span className="text-[13px] font-bold text-white tabular-nums">
                    {f.total_minutes ? `${(f.total_minutes / 60).toFixed(1)}h` : '—'}
                  </span>
                </button>
              ))}
              {flights.length === 0 && <p className="text-[12px] text-white/40 py-3">No flights logged yet.</p>}
            </div>
          </div>
        )}

        {mode === 'trip-view' && trip && (
          <div className="px-4 pt-3.5 pb-4">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[15px] font-bold text-white">
                {trip.flight.legs?.[0]?.takeoff_location ?? '—'} → {trip.flight.legs?.[trip.flight.legs.length - 1]?.landing_location ?? '—'}
              </p>
              <div className="flex gap-2">
                <button onClick={() => { cancelAnimationFrame(animRef.current); setMode('trips') }}
                  className="text-[12px] font-semibold text-white/50 px-3 py-1.5 rounded-full bg-white/[0.08] active:bg-white/[0.15]">Back</button>
                <button onClick={exitToMenu}
                  className="text-[12px] font-semibold text-white px-3 py-1.5 rounded-full bg-white/[0.08] active:bg-white/[0.15]">Done</button>
              </div>
            </div>
            {!trip.coords && (
              <p className="text-[11px] text-amber-300/80 mb-2">
                Couldn't match this flight's locations to saved waypoints, so the route can't be drawn.
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                ['Date', new Date(trip.flight.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })],
                ['Duration', trip.flight.total_minutes ? `${(trip.flight.total_minutes / 60).toFixed(1)} h` : '—'],
                ['Fuel', trip.flight.fuel_consumed_gal != null ? `${trip.flight.fuel_consumed_gal} gal` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-white/[0.06] py-2.5">
                  <p className="text-[9px] uppercase tracking-wider text-white/35">{k}</p>
                  <p className="text-[14px] font-bold text-white mt-1 tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {selected && (
        <WaypointSheet waypoint={selected} onClose={() => setSelected(null)}
          onDelete={deactivateWaypoint} />
      )}
      {draft && (
        <NewWaypointSheet draft={draft} dbReady={dbReady}
          onClose={() => setDraft(null)} onSave={addWaypoint} />
      )}
    </div>
  )
}

// ── Detail sheet ──────────────────────────────────────────────────────────────
function WaypointSheet({ waypoint: w, onClose, onDelete }) {
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  const [confirm, setConfirm] = useState(false)
  return (
    <>
      <div className="drawer-overlay opacity-100" onClick={onClose} />
      <div className="drawer-panel translate-y-0" style={panelStyle} {...panelProps}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="px-5 pt-2 pb-8 space-y-4">
          <div>
            <p className="text-[20px] font-bold text-white">{w.name}</p>
            <p className="text-[13px] text-white/40 mt-0.5">
              {w.code && <span className="text-white/60 font-semibold">{w.code} · </span>}
              {w.kind}{w.country ? ` · ${w.country}` : ''}
            </p>
          </div>
          <div className="card space-y-1.5">
            <p className="text-[13px] text-white/80 font-mono">{formatDMS(w.lat, w.lng)}</p>
            <p className="text-[12px] text-white/35 font-mono">{Number(w.lat).toFixed(5)}, {Number(w.lng).toFixed(5)}</p>
            {w.elevation_ft != null && <p className="text-[12px] text-white/35">Elevation {w.elevation_ft.toLocaleString()} ft</p>}
            {w.notes && <p className="text-[12px] text-white/45 pt-1">{w.notes}</p>}
          </div>
          {w.source !== 'aip' && !w.bundled && (
            <button
              onClick={() => confirm ? (onDelete(w.id), onClose()) : setConfirm(true)}
              className={`w-full py-3 rounded-2xl text-sm font-semibold transition-colors
                ${confirm ? 'bg-red-500 text-white' : 'text-red-400/70 active:bg-red-500/10'}`}>
              {confirm ? 'Tap again to remove waypoint' : 'Remove Waypoint'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}

// ── Create sheet ──────────────────────────────────────────────────────────────
function NewWaypointSheet({ draft, dbReady, onClose, onSave }) {
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  const [name,   setName]   = useState('')
  const [code,   setCode]   = useState('')
  const [kind,   setKind]   = useState('helipad')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  async function save() {
    if (!name.trim()) { setError('Give it a name'); return }
    setSaving(true); setError(null)
    try {
      await onSave({
        name: name.trim(),
        code: code.trim() ? code.trim().toUpperCase() : null,
        kind,
        lat: Math.round(draft.lat * 1e6) / 1e6,
        lng: Math.round(draft.lng * 1e6) / 1e6,
      })
      onClose()
    } catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <>
      <div className="drawer-overlay opacity-100" onClick={onClose} />
      <div className="drawer-panel translate-y-0" style={panelStyle} {...panelProps}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="px-5 pt-2 pb-8 space-y-4">
          <div>
            <p className="text-[20px] font-bold text-white">New Waypoint</p>
            <p className="text-[13px] text-white/40 mt-0.5 font-mono">{formatDMS(draft.lat, draft.lng)}</p>
          </div>
          <input className="input-field w-full" placeholder="Name (e.g. Finca Los Nacimientos)"
            value={name} onChange={e => setName(e.target.value)} autoFocus />
          <input className="input-field w-full" placeholder="Short code (optional)"
            value={code} onChange={e => setCode(e.target.value)} maxLength={6} />
          <div className="grid grid-cols-3 gap-2">
            {['helipad', 'aerodrome', 'custom'].map(k => (
              <button key={k} onClick={() => setKind(k)}
                className={`py-2.5 rounded-xl text-xs font-semibold capitalize transition-colors
                  ${kind === k ? 'bg-white text-black' : 'bg-white/[0.06] text-white/40'}`}>
                {k}
              </button>
            ))}
          </div>
          {!dbReady && (
            <p className="text-[11px] text-amber-300/80">
              The waypoints table isn't in the database yet — saving will fail until the
              2026-08-24 migrations are run.
            </p>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button onClick={save} disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-white text-black text-sm font-semibold active:scale-[0.98] disabled:opacity-50">
            {saving ? 'Saving…' : 'Save Waypoint'}
          </button>
        </div>
      </div>
    </>
  )
}
