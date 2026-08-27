import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useWaypoints } from '../hooks/useWaypoints'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import { formatDMS, parseCoords, haversineNm } from '../lib/geo'
import { computeQuote } from '../lib/quote'
import { useQuoteProfile } from '../hooks/useQuoteProfile'
import { useRouteWinds } from '../hooks/useRouteWinds'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { loadStyle, SALVADOR_CENTER, AVIARA_URL } from '../lib/mapStyle'
import { addEsriToMapLibre } from '../lib/esriSatellite'

const LONG_PRESS_MS = 450

const toFeature = w => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
  properties: { id: w.id, code: w.code ?? '', name: w.name, kind: w.kind },
})
const fc = list => ({ type: 'FeatureCollection', features: list.map(toFeature) })

// ── AIP map pins: teardrop marker, plane for airports (blue), circled H for
// heliports (orange). Inline SVG → Image so no assets ship separately.
const PIN_BODY = 'M12 1.5C7.31 1.5 3.5 5.31 3.5 10c0 5.8 8.5 12.5 8.5 12.5S20.5 15.8 20.5 10C20.5 5.31 16.69 1.5 12 1.5z'
const PLANE = 'M21 16v-2l-8-5V3.5C13 2.67 12.33 2 11.5 2S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z'
const pinSvg = (fill, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="56" viewBox="0 0 24 24">` +
  `<path d="${PIN_BODY}" fill="${fill}" stroke="#FFFFFF" stroke-width="1.1"/>${inner}</svg>`
const AIRPORT_PIN = pinSvg('#2E6FBF',
  `<g transform="translate(12 9.6) rotate(45) scale(0.52) translate(-11.5 -12)"><path d="${PLANE}" fill="#FFFFFF"/></g>`)
const HELIPORT_PIN = pinSvg('#F0821E',
  `<circle cx="12" cy="9.6" r="5.6" fill="none" stroke="#FFFFFF" stroke-width="1.5"/>` +
  `<path d="M9.9 6.9v5.4M14.1 6.9v5.4M9.9 9.6h4.2" stroke="#FFFFFF" stroke-width="1.6" stroke-linecap="round" fill="none"/>`)
const loadPin = svg => new Promise((resolve, reject) => {
  const img = new Image(56, 56)
  img.onload = () => resolve(img)
  img.onerror = reject
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
})

// ── Ops workspace ──
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
    if (v && typeof v === 'object') return { aip: !!v.aip, custom: v.custom !== false, sat: !!v.sat }
  } catch { /* shipped defaults */ }
  return { aip: false, custom: true, sat: false }   // aerodromes and satellite OFF by default
}

export default function MapPage() {
  const navigate = useNavigate()
  const location = useLocation()
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
  const routePointsRef = useRef([])
  const roundTripRef = useRef(true)
  const insertDiversionRef = useRef(null)
  const pickingRef = useRef(null)
  const pickPointRef = useRef(null)
  const [routePoints, setRoutePoints] = useState([])     // quote route, in tap order
  const [trip, setTrip] = useState(null)                 // selected past flight
  const animRef = useRef(null)                           // breadcrumb rAF id

  const { selectedAircraft } = useAircraft()
  const { flights } = useFlights(selectedAircraft?.id)
  const profile = useQuoteProfile(selectedAircraft?.id)
  const [roundTrip, setRoundTrip] = useState(true)
  routePointsRef.current = routePoints
  roundTripRef.current = roundTrip
  // Drag the route line → insert a diversion point at that leg (set here so the
  // map's native handlers, bound once, always call the fresh state setters)
  insertDiversionRef.current = (legIdx, lat, lng) => {
    const w = { ...pinToPoint({ lat, lng }), diversion: true }
    setRoutePoints(ps => { const n = [...ps]; n.splice(legIdx + 1, 0, w); return n })
  }
  const [waitingHr, setWaitingHr] = useState(0)
  const [collapsed, setCollapsed] = useState(false)   // quote card folded to a summary bar
  const swipeY = useRef(null)
  const [cruiseAltFt, setCruiseAltFt] = useState(null)   // null → profile default
  const [picking, setPicking]     = useState(null)   // 'from' | 'to' | 'stop' → search sheet
  pickingRef.current = picking
  // While the picker is open, a tap on the chart resolves right into the slot:
  // a site if one is under the finger, otherwise the exact pilot coordinates
  pickPointRef.current = (w) => placeWaypoint(w, pickingRef.current)
  const [pin, setPin]             = useState(null)   // MFS-style dropped pin {lat,lng,x,y}

  // Default departure: last one used, else Salamanca (CNA's base)
  function defaultFrom() {
    const list = waypointsRef.current
    const savedId = localStorage.getItem('cna:quoteFrom')
    return list.find(w => String(w.id) === savedId)
        ?? list.find(w => (w.code ?? '').toUpperCase() === 'SALA')
        ?? list.find(w => w.name.toUpperCase().includes('SALAMANCA'))
        ?? null
  }

  function startQuote() {
    const home = defaultFrom()
    setRoutePoints(home ? [home] : [])
    setRoundTrip(profile.round_trip_default)
    setWaitingHr(0)
    setCollapsed(false)
    setMode('quote')
  }

  function pinToPoint(p) {
    // DD°MM'SS" with no decimals — pilots paste this straight into ForeFlight
    return {
      id: `adhoc-${p.lat.toFixed(5)},${p.lng.toFixed(5)}`,
      name: formatDMS(p.lat, p.lng),
      code: null, lat: p.lat, lng: p.lng, source: 'adhoc',
    }
  }

  function pinAsRoute(slot) {
    const w = pinToPoint(pin)
    setPin(null)
    if (mode !== 'quote') {
      const home = defaultFrom()
      setRoundTrip(profile.round_trip_default)
      setWaitingHr(0)
      setRoutePoints(slot === 'from' ? [w] : (home ? [home, w] : [w]))
      setMode('quote')
      return
    }
    placeWaypoint(w, slot)
  }

  function placeWaypoint(w, slot) {
    setRoutePoints(ps => {
      if (slot === 'from') {
        try { localStorage.setItem('cna:quoteFrom', String(w.id)) } catch { /* ok */ }
        return ps.length ? [w, ...ps.slice(1)] : [w]
      }
      if (slot === 'to')   return ps.length >= 2 ? [...ps.slice(0, -1), w] : [...ps, w]
      /* stop */           return ps.length >= 2 ? [...ps.slice(0, -1), w, ps[ps.length - 1]] : [...ps, w]
    })
    setPicking(null)
  }

  const containerRef = useRef(null)
  const cardRef = useRef(null)
  const mapRef = useRef(null)
  // Frame the whole route in the map area the quote card leaves visible
  const fitRoute = () => {
    const map = mapRef.current
    const pts = routePointsRef.current
    if (!map || pts.length < 2) return
    const b = new maplibregl.LngLatBounds()
    pts.forEach(w => b.extend([w.lng, w.lat]))
    const cardH = cardRef.current?.getBoundingClientRect().height ?? 300
    const boxH  = containerRef.current?.clientHeight ?? 800
    const bottom = Math.min(cardH + 28, Math.max(140, boxH - 200))
    try {
      map.fitBounds(b, { padding: { top: 110, left: 56, right: 56, bottom }, maxZoom: 12, duration: 700 })
    } catch { /* container smaller than padding — skip rather than crash */ }
  }
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

      map.on('load', async () => {
        map.addSource('aip',    { type: 'geojson', data: fc([]) })
        map.addSource('custom', { type: 'geojson', data: fc([]) })

        // Pin images must exist before the symbol layer references them
        try {
          const [airportImg, heliImg] = await Promise.all([loadPin(AIRPORT_PIN), loadPin(HELIPORT_PIN)])
          map.addImage('pin-airport',  airportImg, { pixelRatio: 2 })
          map.addImage('pin-heliport', heliImg,    { pixelRatio: 2 })
        } catch { /* pins missing → labels still render */ }

        map.addLayer({
          id: 'aip-dots', type: 'symbol', source: 'aip',
          layout: {
            // airports = blue plane pin, heliports = orange circled-H pin
            'icon-image': ['case', ['==', ['get', 'kind'], 'heliport'], 'pin-heliport', 'pin-airport'],
            'icon-size': ['interpolate', ['linear'], ['zoom'], 5, 0.55, 9, 0.8, 12, 1],
            'icon-anchor': 'bottom',
            'icon-allow-overlap': true,
          },
        })
        map.addLayer({
          id: 'aip-labels', type: 'symbol', source: 'aip',
          minzoom: 7.5,
          layout: {
            'text-field': ['step', ['zoom'],
              ['coalesce', ['get', 'code'], ''],
              10.5, ['case',
                ['==', ['coalesce', ['get', 'code'], ''], ''], ['get', 'name'],
                ['concat', ['get', 'code'], '\n', ['get', 'name']]],
            ],
            'text-font': ['Noto Sans Regular'],
            'text-size': ['step', ['zoom'], 10, 10.5, 11],
            'text-max-width': 9,
            'text-offset': [0, 0.4],
            'text-anchor': 'top',
          },
          paint: { 'text-color': ['case', ['==', ['get', 'kind'], 'heliport'], '#B55E08', '#2B5E9C'], 'text-halo-color': 'rgba(255,255,255,0.8)', 'text-halo-width': 1 },
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
          paint: { 'text-color': '#0B7377', 'text-halo-color': 'rgba(255,255,255,0.85)', 'text-halo-width': 1 },
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
          // Sites picked for a quote carry halo:true and get the pulsing ring
          // instead of this static dot (which doubled up under their pin)
          filter: ['all', ['==', ['geometry-type'], 'Point'], ['!=', ['get', 'halo'], true]],
          paint: { 'circle-radius': 5, 'circle-color': '#FFFFFF', 'circle-stroke-color': '#2CB9BD', 'circle-stroke-width': 2.5 },
        })
        // Selection halo: breathes under a site's pin when chosen for the route
        map.addSource('halo', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'route-halo', type: 'circle', source: 'halo',
          paint: {
            'circle-radius': 10, 'circle-color': '#000000', 'circle-opacity': 0.3,
            'circle-stroke-color': '#000000', 'circle-stroke-width': 2, 'circle-stroke-opacity': 0.8,
          },
        }, 'aip-dots')
        map.addSource('crumb', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'crumb-dot', type: 'circle', source: 'crumb',
          paint: { 'circle-radius': 7, 'circle-color': '#2CB9BD', 'circle-stroke-color': '#FFFFFF', 'circle-stroke-width': 2.5 },
        })
        // Invisible fat line over the route — the grab handle for drag-to-divert
        map.addLayer({
          id: 'route-hit', type: 'line', source: 'route',
          filter: ['==', ['geometry-type'], 'LineString'],
          paint: { 'line-color': '#000000', 'line-opacity': 0.001, 'line-width': 28 },
        })

        // Esri satellite (AVIARA's shared module): mounted once under every
        // overlay, shown or hidden by the layers toggle. Anonymous endpoint
        // until VITE_ARCGIS_KEY exists — see the licence block in the module.
        addEsriToMapLibre(map, {
          key: import.meta.env.VITE_ARCGIS_KEY || null,
          labels: true,
          beforeId: 'route-halo',
        })

        // AVIARA layers: apply saved visibility (aerodromes hidden by default)
        const vis = layersRef.current
        for (const id of ['aip-dots', 'aip-labels'])
          map.setLayoutProperty(id, 'visibility', vis.aip ? 'visible' : 'none')
        for (const id of ['custom-dots', 'custom-labels'])
          map.setLayoutProperty(id, 'visibility', vis.custom ? 'visible' : 'none')
        for (const id of ['esri-imagery', 'esri-roads', 'esri-places'])
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis.sat ? 'visible' : 'none')

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
          if (pickingRef.current) pickPointRef.current?.(w)
          else setRoutePoints(ps => (ps[ps.length - 1]?.id === w.id ? ps : [...ps, w]))
        } else {
          setSelected(w)
        }
      }
      map.on('click', 'aip-dots', pick)
      map.on('click', 'custom-dots', pick)
      map.on('click', e => {
        if (!pickingRef.current) return
        const layers = ['aip-dots', 'custom-dots'].filter(id => map.getLayer(id))
        if (map.queryRenderedFeatures(e.point, { layers }).length) return   // a site claimed it
        pickPointRef.current?.({
          id: `adhoc-${e.lngLat.lat.toFixed(5)},${e.lngLat.lng.toFixed(5)}`,
          name: formatDMS(e.lngLat.lat, e.lngLat.lng),
          code: null, lat: e.lngLat.lat, lng: e.lngLat.lng, source: 'adhoc',
        })
      })
      map.on('mouseenter', 'aip-dots',    () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'aip-dots',    () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'custom-dots', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'custom-dots', () => { map.getCanvas().style.cursor = '' })

      // Desktop right-click → new waypoint
      map.on('contextmenu', e => {
        if (modeRef.current !== 'menu' && modeRef.current !== 'quote') return
        setPin({ lat: e.lngLat.lat, lng: e.lngLat.lng, x: e.point.x, y: e.point.y })
      })

      // Mobile long-press → new waypoint (MapLibre has no touch contextmenu)
      let pressTimer = null, pressAt = null
      map.on('touchstart', e => {
        if (e.originalEvent.touches.length !== 1) return
        if (modeRef.current !== 'menu' && modeRef.current !== 'quote') return
        pressAt = e.lngLat
        const pt = e.point
        pressTimer = setTimeout(() => setPin({ lat: pressAt.lat, lng: pressAt.lng, x: pt.x, y: pt.y }), LONG_PRESS_MS)
      })
      const cancelPress = () => { clearTimeout(pressTimer); pressTimer = null }
      map.on('touchmove', cancelPress)
      map.on('touchend', cancelPress)
      map.on('move', cancelPress)
      map.on('movestart', () => setPin(null))

      // ── Drag the route off water: pull the line aside to add a diversion
      //    point (pilot request — "not a landing, just a diversion") ──
      const distToSeg = (p, a, b) => {
        const dx = b.x - a.x, dy = b.y - a.y
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
        return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
      }
      const drag = { active: false, idx: -1, pos: null }
      const nearestLeg = e => {
        const pts = routePointsRef.current
        if (pts.length < 2) return -1
        let best = -1, bestD = Infinity
        for (let i = 0; i < pts.length - 1; i++) {
          const a = map.project([pts[i].lng, pts[i].lat])
          const b = map.project([pts[i + 1].lng, pts[i + 1].lat])
          const d = distToSeg(e.point, a, b)
          if (d < bestD) { bestD = d; best = i }
        }
        return best
      }
      const drawDrag = () => {
        const pts = routePointsRef.current
        const coords = pts.map(w => [w.lng, w.lat])
        coords.splice(drag.idx + 1, 0, [drag.pos.lng, drag.pos.lat])
        map.getSource('route')?.setData({ type: 'FeatureCollection', features: [
          { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
          ...coords.slice(0, -1).map(c => ({ type: 'Feature', geometry: { type: 'Point', coordinates: c }, properties: {} })),
        ] })
      }
      const startRouteDrag = e => {
        if (modeRef.current !== 'quote') return
        const idx = nearestLeg(e)
        if (idx < 0) return
        e.preventDefault()
        cancelPress()
        drag.active = true; drag.idx = idx; drag.pos = e.lngLat
        map.dragPan.disable()
        map.getCanvas().style.cursor = 'grabbing'
      }
      const moveRouteDrag = e => {
        if (!drag.active) return
        e.preventDefault?.()
        drag.pos = e.lngLat
        drawDrag()
      }
      const endRouteDrag = () => {
        if (!drag.active) return
        drag.active = false
        map.dragPan.enable()
        map.getCanvas().style.cursor = ''
        insertDiversionRef.current?.(drag.idx, drag.pos.lat, drag.pos.lng)
      }
      map.on('mousedown',  'route-hit', startRouteDrag)
      map.on('touchstart', 'route-hit', startRouteDrag)
      map.on('mousemove', moveRouteDrag)
      map.on('touchmove', moveRouteDrag)
      map.on('mouseup',  endRouteDrag)
      map.on('touchend', endRouteDrag)
      map.on('mouseenter', 'route-hit', () => { if (modeRef.current === 'quote') map.getCanvas().style.cursor = 'grab' })
      map.on('mouseleave', 'route-hit', () => { if (!drag.active) map.getCanvas().style.cursor = '' })
    })

    return () => { cancelled = true; mapRef.current = null; map?.remove() }
  }, [])

  // ── Deep link: dashboard buttons land here already in quote/trips mode ──
  useEffect(() => {
    const m = location.state?.mode
    if (m !== 'quote' && m !== 'trips') return
    cancelAnimationFrame(animRef.current)
    setTrip(null)
    window.history.replaceState({}, '')
    if (m === 'quote') startQuote()
    else { setRoutePoints([]); setMode(m) }
  }, [location.state])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Quote math: climb/cruise/descent physics + winds aloft ──
  const altFt = cruiseAltFt ?? profile.default_cruise_alt_ft
  const wind = useRouteWinds(mode === 'quote' ? routePoints : [], altFt)
  const quote = useMemo(
    () => computeQuote({ points: routePoints, roundTrip, waitingHr, cruiseAltFt: altFt, wind, profile }),
    [routePoints, roundTrip, waitingHr, altFt, wind, profile]
  )

  // ── Draw the quote route + fit the camera ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const choosing = routePoints.length < 2   // route not determined yet
    const feats = routePoints.map(w => ({
      type: 'Feature', geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
      // while choosing, pinned sites pulse; once the route is set every point
      // draws as a plain marker and the pulse retires
      properties: { halo: choosing && w.source !== 'adhoc' },
    }))
    map.getSource('halo')?.setData({
      type: 'FeatureCollection',
      features: mode === 'quote' && choosing ? feats.filter(f => f.geometry.type === 'Point') : [],
    })
    if (routePoints.length >= 2) {
      const coords = routePoints.map(w => [w.lng, w.lat])
      feats.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: coords },
        properties: {},
      })
    }
    map.getSource('route')?.setData({ type: 'FeatureCollection', features: feats })
    if (routePoints.length >= 2) fitRoute()
  }, [routePoints, roundTrip, mode, ready])   // eslint-disable-line react-hooks/exhaustive-deps

  // The card grows when the breakdown appears — re-frame so it never swallows
  // the route the user just built
  useEffect(() => {
    const el = cardRef.current
    if (mode !== 'quote' || !el || typeof ResizeObserver === 'undefined') return
    let last = el.getBoundingClientRect().height
    const ro = new ResizeObserver(() => {
      const h = el.getBoundingClientRect().height
      if (Math.abs(h - last) > 24) { last = h; fitRoute() }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [mode])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Halo pulse: the chosen site's ring breathes so "picked" is unmissable ──
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || mode !== 'quote' || routePoints.length !== 1) return
    let raf
    const start = performance.now()
    const tick = now => {
      const t = ((now - start) % 1600) / 1600
      if (map.getLayer('route-halo')) {
        map.setPaintProperty('route-halo', 'circle-radius', 8 + t * 16)
        map.setPaintProperty('route-halo', 'circle-opacity', 0.3 * (1 - t))
        map.setPaintProperty('route-halo', 'circle-stroke-opacity', 0.9 * (1 - t))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, routePoints.length, ready])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Trips: resolve a flight's legs to waypoints, draw, and fly the crumb ──
  function resolveTrip(flight) {
    const find = name => {
      if (!name) return null
      const n = String(name).trim().toUpperCase()
      return waypointsRef.current.find(w => (w.code ?? '').toUpperCase() === n)
          ?? waypointsRef.current.find(w => w.name.toUpperCase().includes(n))
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
      for (const leg of flight.legs ?? []) {
        push(find(leg.takeoff_location))
        for (const v of leg.via ?? []) push(find(v))
        push(find(leg.landing_location))
      }
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
    setRoutePoints([]); setTrip(null); setMode('menu'); setCollapsed(false)
    const map = mapRef.current
    if (map && ready) {
      map.getSource('route')?.setData({ type: 'FeatureCollection', features: [] })
      map.getSource('crumb')?.setData({ type: 'FeatureCollection', features: [] })
      map.getSource('halo')?.setData({ type: 'FeatureCollection', features: [] })
    }
  }

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    // While quoting, every site must be tappable regardless of layer prefs
    if (mode === 'quote') {
      // Choosing: every site tappable. Route determined: the chart clears so
      // only the route remains, and the camera has already fit to it.
      const vis = routePoints.length >= 2 ? 'none' : 'visible'
      for (const id of ['aip-dots', 'aip-labels', 'custom-dots', 'custom-labels'])
        map.setLayoutProperty(id, 'visibility', vis)
    } else {
      for (const id of ['aip-dots', 'aip-labels'])
        map.setLayoutProperty(id, 'visibility', layers.aip ? 'visible' : 'none')
      for (const id of ['custom-dots', 'custom-labels'])
        map.setLayoutProperty(id, 'visibility', layers.custom ? 'visible' : 'none')
    }
  }, [mode, ready, routePoints.length >= 2])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── AVIARA layers: visibility follows the toggles, persisted ──
  useEffect(() => {
    try { localStorage.setItem(LAYERS_KEY, JSON.stringify(layers)) } catch { /* ok */ }
    const map = mapRef.current
    if (!map || !ready) return
    for (const id of ['aip-dots', 'aip-labels'])
      map.setLayoutProperty(id, 'visibility', layers.aip ? 'visible' : 'none')
    for (const id of ['custom-dots', 'custom-labels'])
      map.setLayoutProperty(id, 'visibility', layers.custom ? 'visible' : 'none')
    for (const id of ['esri-imagery', 'esri-roads', 'esri-places'])
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', layers.sat ? 'visible' : 'none')
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
        style={{ position: 'absolute', inset: 0, isolation: 'isolate', background: 'var(--bg-base)' }} />

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
          <p className="text-[11px] text-white/75 leading-none">Hold anywhere to drop a pin</p>
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
                { key: 'sat',    label: 'Satellite',    sub: 'Esri imagery + labels' },
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

      {/* MFS-style dropped pin: pilot coordinates + route actions */}
      {pin && (
        <div className="absolute z-20"
          style={{
            left: Math.min(Math.max(pin.x, 110), (containerRef.current?.clientWidth ?? 400) - 110),
            top: pin.y,
            transform: pin.y > 190 ? 'translate(-50%, calc(-100% - 14px))' : 'translate(-50%, 14px)',
          }}>
          <div className="rounded-2xl overflow-hidden min-w-[13rem]"
            style={{ background: 'rgba(30,30,32,0.72)', backdropFilter: 'blur(40px) saturate(200%)',
                     WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                     border: '0.5px solid rgba(255,255,255,0.12)',
                     boxShadow: '0 12px 36px rgba(0,0,0,0.55)' }}>
            <div className="px-3.5 pt-3 pb-2.5 flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold text-white font-mono leading-snug">{formatDMS(pin.lat, pin.lng)}</p>
                <p className="text-[10px] text-white/35 font-mono mt-0.5">{pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}</p>
              </div>
              <button onClick={() => setPin(null)} className="text-white/40 text-[15px] leading-none px-1 -mr-1">✕</button>
            </div>
            <button onClick={() => pinAsRoute('from')}
              className="w-full text-left px-3.5 py-2.5 text-[13px] font-semibold text-white border-t border-white/[0.08] active:bg-white/[0.08]">
              Set as departure
            </button>
            <button onClick={() => pinAsRoute('to')}
              className="w-full text-left px-3.5 py-2.5 text-[13px] font-semibold text-white border-t border-white/[0.08] active:bg-white/[0.08]">
              Set as destination
            </button>
            <button onClick={() => { setDraft({ lat: pin.lat, lng: pin.lng }); setPin(null) }}
              className="w-full text-left px-3.5 py-2.5 text-[13px] font-semibold text-accent border-t border-white/[0.08] active:bg-white/[0.08]">
              Save as waypoint
            </button>
          </div>
          {/* stem dot on the pressed spot */}
          <div className="absolute left-1/2 w-2.5 h-2.5 rounded-full bg-white border-2 border-accent"
            style={{ transform: 'translateX(-50%)',
                     [pin.y > 190 ? 'bottom' : 'top']: '-19px' }} />
        </div>
      )}

      {/* ── Ops card — floating context card at the bottom ── */}
      <div ref={cardRef} className="absolute left-3 right-3 z-10 rounded-3xl overflow-hidden"
        style={{ bottom: 'max(env(safe-area-inset-bottom, 0px), 0.5rem)',
                 background: 'rgba(30,30,32,0.62)', backdropFilter: 'blur(40px) saturate(200%)',
                 WebkitBackdropFilter: 'blur(40px) saturate(200%)',
                 border: '0.5px solid rgba(255,255,255,0.10)',
                 boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>

        {mode === 'menu' && (
          <div className="grid grid-cols-3 gap-2.5 p-3">
            {[
              { label: 'Flight plan', onClick: () => window.open(AVIARA_URL, '_blank') },
              { label: 'Quote',       onClick: startQuote },
              { label: 'Trips',       onClick: () => setMode('trips') },
            ].map(({ label, onClick }) => (
              <button key={label} onClick={onClick}
                className="vital-tile items-center justify-center py-3.5">
                <span className="text-[13px] font-semibold text-white leading-none">{label}</span>
              </button>
            ))}
          </div>
        )}

        {mode === 'quote' && collapsed && (
          <button className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
            onClick={() => setCollapsed(false)}>
            <span className="text-[13px] font-semibold text-white truncate">
              {routePoints.length >= 2
                ? `${routePoints[0].code || routePoints[0].name} → ${routePoints[routePoints.length - 1].code || routePoints[routePoints.length - 1].name}`
                : 'Quote'}
            </span>
            <span className="flex items-center gap-2.5 flex-shrink-0">
              {quote && <span className="text-[15px] font-bold text-white tabular-nums">${Math.round(quote.total).toLocaleString('en-US')}</span>}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"
                className="w-4 h-4 text-white/40"><path d="M6 15l6-6 6 6" /></svg>
            </span>
          </button>
        )}

        {mode === 'quote' && !collapsed && (
          <div className="px-4 pt-3.5 pb-4"
            onTouchStart={e => { swipeY.current = e.touches[0].clientY }}
            onTouchMove={e => {
              if (swipeY.current == null) return
              // Pull the card down → fold it to a summary so the map breathes
              if (e.touches[0].clientY - swipeY.current > 48 && routePoints.length >= 2) {
                swipeY.current = null
                setCollapsed(true)
              }
            }}
            onTouchEnd={() => { swipeY.current = null }}
            onWheel={e => { if (e.deltaY > 30 && routePoints.length >= 2) setCollapsed(true) }}>
            <div className="flex items-center justify-between mb-2.5">
              <button onClick={() => setRoundTrip(v => !v)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-semibold transition-colors
                  ${roundTrip ? 'bg-accent text-black' : 'bg-white/[0.08] text-white/50'}`}>
                Round trip
              </button>
              <div className="flex gap-2">
                {routePoints.length > 0 && (
                  <button onClick={() => setRoutePoints([])}
                    className="text-[12px] font-semibold text-white/50 px-3 py-1.5 rounded-full bg-white/[0.08] active:bg-white/[0.15]">Clear</button>
                )}
                <button onClick={exitToMenu}
                  className="text-[12px] font-semibold text-white px-3 py-1.5 rounded-full bg-white/[0.08] active:bg-white/[0.15]">Done</button>
              </div>
            </div>
            {(() => {
              const from = routePoints[0] ?? null
              const to   = routePoints.length >= 2 ? routePoints[routePoints.length - 1] : null
              const stops = routePoints.slice(1, -1)
              const wpName = w => w ? (w.code || w.name) : null
              return (
                <div className="space-y-1.5 mb-3">
                  <button onClick={() => setPicking('from')}
                    className="w-full flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2.5 active:bg-white/[0.12]">
                    <span className="text-[10px] uppercase tracking-wider text-white/35 w-9 text-left flex-shrink-0">From</span>
                    <span className={`text-[13px] font-semibold ${from ? 'text-white' : 'text-white/30'}`}>
                      {wpName(from) ?? 'Choose departure'}
                    </span>
                  </button>
                  {stops.map((wp, i) => (
                    <div key={`${wp.id}-${i}`} className="w-full flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2.5">
                      <span className="text-[10px] uppercase tracking-wider text-white/35 w-9 text-left flex-shrink-0">{wp.diversion ? 'Via' : 'Stop'}</span>
                      <span className="text-[13px] font-semibold text-white">{wpName(wp)}</span>
                      <button className="ml-auto text-white/35 text-[15px] px-1.5"
                        onClick={() => setRoutePoints(ps => ps.filter((_, j) => j !== i + 1))}>×</button>
                    </div>
                  ))}
                  <button onClick={() => setPicking('to')}
                    className="w-full flex items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2.5 active:bg-white/[0.12]">
                    <span className="text-[10px] uppercase tracking-wider text-white/35 w-9 text-left flex-shrink-0">To</span>
                    <span className={`text-[13px] font-semibold ${to ? 'text-white' : 'text-white/30'}`}>
                      {wpName(to) ?? 'Choose destination'}
                    </span>
                  </button>
                  {from && to && (
                    <button onClick={() => setPicking('stop')}
                      className="text-[11px] font-semibold text-accent px-1 pt-0.5 active:opacity-70">+ Add stop</button>
                  )}
                  {!to && (
                    <p className="text-[10.5px] text-white/30 px-1">Search above, or tap a site on the chart.</p>
                  )}
                </div>
              )
            })()}
            {routePoints.length >= 2 && (
              <>

                {/* Adjustments — altitude and waiting share one row */}
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[12px] text-white/60">Alt</span>
                  <button onClick={() => setCruiseAltFt(a => Math.max(1500, (a ?? profile.default_cruise_alt_ft) - 500))}
                    className="w-7 h-7 rounded-full bg-white/[0.08] text-white/70 text-[15px] leading-none active:bg-white/[0.15]">−</button>
                  <span className="text-[12px] font-bold text-white tabular-nums">{altFt.toLocaleString('en-US')} ft</span>
                  <button onClick={() => setCruiseAltFt(a => Math.min(12000, (a ?? profile.default_cruise_alt_ft) + 500))}
                    className="w-7 h-7 rounded-full bg-white/[0.08] text-white/70 text-[15px] leading-none active:bg-white/[0.15]">+</button>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[12px] text-white/60">Waiting</span>
                    <button onClick={() => setWaitingHr(h => Math.max(0, +(h - 0.5).toFixed(1)))}
                      className="w-7 h-7 rounded-full bg-white/[0.08] text-white/70 text-[15px] leading-none active:bg-white/[0.15]">−</button>
                    <span className="text-[12px] font-bold text-white tabular-nums w-8 text-center">{waitingHr} h</span>
                    <button onClick={() => setWaitingHr(h => +(h + 0.5).toFixed(1))}
                      className="w-7 h-7 rounded-full bg-white/[0.08] text-white/70 text-[15px] leading-none active:bg-white/[0.15]">+</button>
                  </div>
                </div>
                <p className="text-[10px] text-white/30 text-right mb-2.5">
                  {wind ? `wind ${Math.round(wind.kts)} kt / ${Math.round(wind.dirDeg)}° (${wind.level})` : 'winds unavailable'}
                </p>

                {quote ? (
                  <>
                    {/* Per-leg strip — DIST / ETE / FUEL, ForeFlight style */}
                    {(() => {
                      const pts = routePoints
                      const dists = []
                      for (let i = 1; i < pts.length; i++)
                        dists.push(haversineNm(pts[i - 1].lat, pts[i - 1].lng, pts[i].lat, pts[i].lng))
                      const outDist = dists.reduce((s, d) => s + d, 0) || 1
                      const outAir  = quote.segments[0]?.airHr ?? 0
                      // Air time shared across legs by distance — totals match the engine
                      const legs = dists.map((d, i) => ({
                        from: pts[i], to: pts[i + 1], nm: d, hr: outAir * (d / outDist),
                      }))
                      if (roundTrip && quote.segments[1])
                        legs.push({ from: pts[pts.length - 1], to: pts[0], nm: quote.segments[1].distNm, hr: quote.segments[1].airHr, back: true })
                      const ete = h => `${Math.floor(h)}h${String(Math.round((h - Math.floor(h)) * 60)).padStart(2, '0')}m`
                      const tag = w => w.code || (w.diversion ? 'Via' : w.source === 'adhoc' ? 'Pin' : w.name)
                      return (
                        <div className="rounded-xl bg-white/[0.05] px-3 py-2 mb-2.5 space-y-1">
                          <div className="flex text-[9.5px] uppercase tracking-wider text-white/40">
                            <span className="flex-1">Leg</span>
                            <span className="w-14 text-right">Dist</span>
                            <span className="w-14 text-right">ETE</span>
                            <span className="w-12 text-right">Fuel</span>
                          </div>
                          {legs.map((l, i) => (
                            <div key={i} className="flex items-baseline text-[12.5px] tabular-nums">
                              <span className="flex-1 font-semibold text-white/90 truncate pr-2">
                                {tag(l.from)} → {tag(l.to)}{l.back && <span className="text-white/30 font-normal"> return</span>}
                              </span>
                              <span className="w-14 text-right text-white/75">{l.nm.toFixed(0)} nm</span>
                              <span className="w-14 text-right text-white/75">{ete(l.hr)}</span>
                              <span className="w-12 text-right text-white/75">{(l.hr * profile.burn_gph).toFixed(0)} g</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                    {/* Breakdown */}
                    <div className="space-y-1.5 mb-2.5">
                      {quote.lines.map(l => (
                        <div key={l.key} className="flex items-baseline justify-between">
                          <span className="text-[13.5px] text-white/70">{l.label}</span>
                          <span className="text-[13.5px] font-semibold text-white tabular-nums">
                            ${Math.round(l.amount).toLocaleString('en-US')}
                          </span>
                        </div>
                      ))}
                      <div className="flex items-baseline justify-between pt-1.5 border-t border-white/[0.08]">
                        <span className="text-[15px] font-bold text-white">
                          Total{profile.tax_included && <span className="font-normal text-white/35 text-[11px]"> IVA incluido</span>}
                        </span>
                        <span className="text-[22px] font-bold text-white tabular-nums">
                          ${Math.round(quote.total).toLocaleString('en-US')}
                        </span>
                      </div>
                    </div>
                    <p className="text-[11px] text-white/40">
                      {quote.totalNm.toFixed(0)} nm · air {quote.airHr.toFixed(1)} h + 0.2 start/stop · {quote.fuelGal.toFixed(0)} gal
                      {quote.tailKts ? ` · ${quote.tailKts > 0 ? 'tail' : 'head'}wind ${Math.abs(quote.tailKts).toFixed(0)} kt` : ''}
                    </p>
                  </>
                ) : (
                  <p className="text-[12px] text-white/40">Tap the next site to complete the leg.</p>
                )}
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

      {picking && (
        <WaypointPicker
          waypoints={waypoints}
          slot={picking}
          onSelect={w => placeWaypoint(w, picking)}
          onClose={() => setPicking(null)}
        />
      )}

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

// ── Waypoint picker — search-first site selection for quoting ────────────────
function WaypointPicker({ waypoints, slot, onSelect, onClose }) {
  const [q, setQ] = useState('')
  const needle = q.trim().toUpperCase()
  const results = useMemo(() => {
    const scored = waypoints
      .filter(w => !needle
        || w.name.toUpperCase().includes(needle)
        || (w.code ?? '').toUpperCase().includes(needle))
      .sort((a, b) => {
        // custom sites first, then exact code hits, then alphabetical
        const ca = a.source !== 'aip' ? 0 : 1, cb = b.source !== 'aip' ? 0 : 1
        if (ca !== cb) return ca - cb
        const ea = (a.code ?? '').toUpperCase() === needle ? 0 : 1
        const eb = (b.code ?? '').toUpperCase() === needle ? 0 : 1
        if (ea !== eb) return ea - eb
        return a.name.localeCompare(b.name)
      })
    return scored.slice(0, 40)
  }, [waypoints, needle])

  const titles = { from: 'Departure', to: 'Destination', stop: 'Add stop' }
  const coords = parseCoords(q)

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-[90] rounded-t-3xl flex flex-col"
        style={{ maxHeight: '42dvh',
                 background: 'rgba(30,30,32,0.72)', backdropFilter: 'blur(50px) saturate(200%)',
                 WebkitBackdropFilter: 'blur(50px) saturate(200%)',
                 border: '0.5px solid rgba(255,255,255,0.10)' }}>
        <div className="px-4 pt-4 pb-2 flex-shrink-0">
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-[15px] font-bold text-white">{titles[slot]}</p>
            <button onClick={onClose}
              className="text-[12px] font-semibold text-white px-3 py-1.5 rounded-full bg-white/[0.08] active:bg-white/[0.15]">Close</button>
          </div>
          <input value={q} onChange={e => setQ(e.target.value)}
            placeholder="Name, code, or coordinates"
            className="input-field w-full" />
          <p className="text-[11px] text-white/35 mt-2">…or tap anywhere on the chart to use that exact spot</p>
        </div>
        <div className="overflow-y-auto flex-1 px-2 pb-6" style={{ overscrollBehavior: 'contain' }}>
          {coords && (
            <button
              onClick={() => onSelect({
                id: `adhoc-${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`,
                name: formatDMS(coords.lat, coords.lng),
                code: null, lat: coords.lat, lng: coords.lng, source: 'adhoc',
              })}
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl active:bg-white/[0.08] text-left">
              <span>
                <span className="block text-[14px] font-semibold text-accent font-mono">{formatDMS(coords.lat, coords.lng)}</span>
                <span className="block text-[11px] text-white/35 mt-0.5">Use these coordinates</span>
              </span>
            </button>
          )}
          {results.map(w => (
            <button key={w.id} onClick={() => onSelect(w)}
              className="w-full flex items-center justify-between px-3 py-3 rounded-xl active:bg-white/[0.08] text-left">
              <span className="min-w-0">
                <span className="block text-[14px] font-semibold text-white truncate">
                  {w.name}{w.code ? <span className="text-white/40 font-normal"> · {w.code}</span> : null}
                </span>
                <span className="block text-[11px] text-white/35 mt-0.5">
                  {w.source !== 'aip' ? 'My waypoint' : `${w.kind}${w.country ? ' · ' + w.country : ''}`}
                </span>
              </span>
              {w.source !== 'aip' && <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 ml-3" />}
            </button>
          ))}
          {results.length === 0 && (
            <p className="text-[12px] text-white/35 px-3 py-4">Nothing matches "{q}".</p>
          )}
        </div>
      </div>
    </>
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
