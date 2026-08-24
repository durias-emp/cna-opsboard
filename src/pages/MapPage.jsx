import { useEffect, useMemo, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useWaypoints } from '../hooks/useWaypoints'
import { formatDMS } from '../lib/geo'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

// AVIARA's exact motor and map: MapLibre GL with OpenFreeMap vector tiles,
// dark style. (In AVIARA, CARTO raster only skins the far-out globe below
// zoom 5 — OpsBoard never leaves chart-reading zooms, so it is pure
// OpenFreeMap here.) Style fetched once per session; AVIARA learned the
// style server rate-limits repeat fetches.
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'
let stylePromise = null
function loadStyle() {
  if (!stylePromise) {
    stylePromise = fetch(STYLE_DARK)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .catch(() => STYLE_DARK)   // MapLibre retries the URL its own way
  }
  return stylePromise
}

const SALVADOR_CENTER = [-88.95, 13.72]   // [lng, lat]
const LONG_PRESS_MS = 450

const toFeature = w => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
  properties: { id: w.id, code: w.code ?? '', name: w.name, kind: w.kind },
})
const fc = list => ({ type: 'FeatureCollection', features: list.map(toFeature) })

export default function MapPage() {
  const { waypoints, dbReady, addWaypoint, deactivateWaypoint } = useWaypoints()
  const [selected, setSelected] = useState(null)
  const [draft,    setDraft]    = useState(null)
  const [ready,    setReady]    = useState(false)

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
      map = new maplibregl.Map({
        container: containerRef.current,
        style,
        center: SALVADOR_CENTER,
        zoom: 8.5,
        attributionControl: { compact: true },
      })
      mapRef.current = map

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
      <div ref={containerRef} className="absolute inset-0 z-0"
        style={{ isolation: 'isolate', background: '#171717' }} />

      {/* Floating title + hint */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none px-4 pt-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}>
        <div className="inline-block rounded-2xl px-3.5 py-2"
          style={{ background: 'rgba(23,23,23,0.82)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}>
          <p className="text-[15px] font-semibold text-white leading-none">Map</p>
          <p className="text-[11px] text-white/40 mt-1 leading-none">Hold anywhere to add a waypoint</p>
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
