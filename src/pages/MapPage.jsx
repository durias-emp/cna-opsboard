import { useMemo, useRef, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Marker, Tooltip, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useWaypoints } from '../hooks/useWaypoints'
import { formatDMS } from '../lib/geo'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

// Same engine and basemap as AVIARA (Leaflet + Carto), none of the heavy
// layers. dark_matter matches the app's Tesla-dark skin out of the box.
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
const ATTRIB = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'

const SALVADOR_CENTER = [13.72, -88.95]

const customIcon = L.divIcon({
  className: '',
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#2CB9BD;border:2.5px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,0.6)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

// Long-press (mobile) / right-click (desktop) → propose a new waypoint
function LongPressCapture({ onPick }) {
  useMapEvents({ contextmenu(e) { onPick(e.latlng) } })
  return null
}

export default function MapPage() {
  const { waypoints, dbReady, addWaypoint, deactivateWaypoint } = useWaypoints()
  const [selected, setSelected] = useState(null)      // waypoint detail sheet
  const [draft,    setDraft]    = useState(null)      // { lat, lng } for the create sheet

  const aip     = useMemo(() => waypoints.filter(w => w.source === 'aip'), [waypoints])
  const customs = useMemo(() => waypoints.filter(w => w.source !== 'aip'), [waypoints])

  return (
    <div className="flex-1 relative">
      {/* isolation: keeps Leaflet's internal z-indexes (200-700) inside this box
          so app overlays (sheets z-70, identity z-200) always paint above the map */}
      <div className="absolute inset-0 z-0" style={{ isolation: 'isolate' }}>
      <MapContainer
        center={SALVADOR_CENTER}
        zoom={9}
        className="absolute inset-0"
        style={{ background: '#171717' }}
        zoomControl={false}
        attributionControl={true}
      >
        <TileLayer url={TILE_URL} attribution={ATTRIB} subdomains="abcd" />
        <LongPressCapture onPick={ll => setDraft({ lat: ll.lat, lng: ll.lng })} />

        {aip.map(w => (
          <CircleMarker
            key={w.id}
            center={[w.lat, w.lng]}
            radius={w.kind === 'heliport' ? 4 : 5}
            pathOptions={{
              color: '#9BA1A8', weight: 1.5,
              fillColor: w.kind === 'heliport' ? '#9BA1A8' : '#5B616B', fillOpacity: 0.85,
            }}
            eventHandlers={{ click: () => setSelected(w) }}
          >
            {w.code && <Tooltip direction="top" offset={[0, -6]}>{w.code}</Tooltip>}
          </CircleMarker>
        ))}

        {customs.map(w => (
          <Marker key={w.id} position={[w.lat, w.lng]} icon={customIcon}
            eventHandlers={{ click: () => setSelected(w) }}>
            <Tooltip direction="top" offset={[0, -8]}>{w.name}</Tooltip>
          </Marker>
        ))}
      </MapContainer>
      </div>

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
