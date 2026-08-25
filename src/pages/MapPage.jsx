import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useWaypoints } from '../hooks/useWaypoints'
import { formatDMS } from '../lib/geo'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { loadStyle, SALVADOR_CENTER } from '../lib/mapStyle'

const LONG_PRESS_MS = 450

const toFeature = w => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
  properties: { id: w.id, code: w.code ?? '', name: w.name, kind: w.kind },
})
const fc = list => ({ type: 'FeatureCollection', features: list.map(toFeature) })

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

      // Tap a marker → detail sheet
      const pick = e => {
        const f = e.features?.[0]
        if (!f) return
        const w = waypointsRef.current.find(x => String(x.id) === String(f.properties.id))
        if (w) setSelected(w)
      }
      map.on('click', 'aip-dots', pick)
      map.on('click', 'custom-dots', pick)
      map.on('mouseenter', 'aip-dots',    () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'aip-dots',    () => { map.getCanvas().style.cursor = '' })
      map.on('mouseenter', 'custom-dots', () => { map.getCanvas().style.cursor = 'pointer' })
      map.on('mouseleave', 'custom-dots', () => { map.getCanvas().style.cursor = '' })

      // Desktop right-click → new waypoint
      map.on('contextmenu', e => setDraft({ lat: e.lngLat.lat, lng: e.lngLat.lng }))

      // Mobile long-press → new waypoint (MapLibre has no touch contextmenu)
      let pressTimer = null, pressAt = null
      map.on('touchstart', e => {
        if (e.originalEvent.touches.length !== 1) return
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
