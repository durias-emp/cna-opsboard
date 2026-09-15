import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMotionValue, animate } from 'framer-motion'
import * as maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { loadStyle, SALVADOR_CENTER, AVIARA_URL } from '../lib/mapStyle'
import { addEsriToMapLibre } from '../lib/esriSatellite'
import { useWaypoints } from '../hooks/useWaypoints'
import { useNotams, notamCircle } from '../hooks/useNotams'
import { useIsManagement } from '../context/TeamContext'
import { useFinanceSummary } from '../hooks/useFinanceSummary'
import { toHobbs, formatDate } from '../lib/utils'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import CrestHeader from '../components/CrestHeader'
import HobbsHistoryDrawer from '../components/HobbsHistoryDrawer'
import FlightDetailSheet from '../components/FlightDetailSheet'
import { useTank } from '../hooks/useTank'
import { HELICOPTER_ICON } from '../assets/navIcons'

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

// Real-looking cumulus for the minimap, tuned live against the chart:
// domain-warped fBm value noise (the standard procedural-cloud technique)
// sampled on a cylinder so the drift loop is seamless in x, clumped by a
// low-frequency mask, lit from the top-left with a soft ground shadow.
// A fresh seed every mount means no two loads share a sky. Rendered at
// half resolution and upscaled — clouds are soft, and it keeps the pixel
// loop ~1/4 the cost.
function cloudDeck(CW, CH, coverage, scaleXY, alphaMax, seed) {
  const W2 = CW, H2 = Math.max(1, Math.round(CH / 2))
  const R = W2 / (Math.PI * 2)
  function hash(x, y, z) {
    let n = (x * 374761393 + y * 668265263 + z * 1440662683 + seed * 97531) | 0
    n = Math.imul(n ^ (n >>> 13), 1274126177)
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295
  }
  const sm = t => t * t * (3 - 2 * t)
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z)
    const u = sm(x - xi), v = sm(y - yi), q = sm(z - zi)
    let acc = 0
    for (let dz = 0; dz < 2; dz++) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++)
      acc += hash(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? q : 1 - q)
    return acc
  }
  function fbm(x, y, z, oct) {
    let a = 0.5, f = 1, s = 0
    for (let o = 0; o < oct; o++) { s += a * noise3(x * f, y * f, z * f); a *= 0.5; f *= 2 }
    return s
  }
  // density field on the cylinder (x wraps perfectly)
  const den = new Float32Array(W2 * H2)
  for (let y = 0; y < H2; y++) {
    for (let x = 0; x < W2; x++) {
      const th = (x / W2) * Math.PI * 2
      const px = Math.cos(th) * R * scaleXY, pz = Math.sin(th) * R * scaleXY, py = y * scaleXY * 3.0
      const q1 = fbm(px + 13.7, py, pz, 4), q2 = fbm(px, py + 91.3, pz, 4)
      const n = fbm(px + 3.5 * q1, py + 3.5 * q2, pz + 1.7 * q1, 6)
      const clump = fbm(px * 0.22 + 51, py * 0.22, pz * 0.22, 3)
      const base = (n * 1.15) * sm(Math.min(1, Math.max(0, (clump - 0.38) / 0.34)))
      den[y * W2 + x] = sm(Math.min(1, Math.max(0, (base - coverage) / 0.16)))
    }
  }
  // shade: light from the top-left, alpha from density
  const cv = document.createElement('canvas'); cv.width = W2; cv.height = H2
  const ctx = cv.getContext('2d'); const img = ctx.createImageData(W2, H2)
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const i = y * W2 + x, d = den[i]
    if (d <= 0.003) { img.data[i * 4 + 3] = 0; continue }
    const gx = den[y * W2 + ((x + 1) % W2)] - den[y * W2 + ((x - 1 + W2) % W2)]
    const gy = den[Math.min(H2 - 1, y + 1) * W2 + x] - den[Math.max(0, y - 1) * W2 + x]
    const light = Math.min(1.12, Math.max(0.55, 0.9 + (-gx * 0.7 - gy * 1.0) * 2.2))
    const c = Math.min(255, Math.round(243 * light))
    img.data[i * 4] = c; img.data[i * 4 + 1] = c; img.data[i * 4 + 2] = Math.min(255, c + 4)
    img.data[i * 4 + 3] = Math.round(255 * Math.min(1, d * 1.6) * alphaMax)
  }
  ctx.putImageData(img, 0, 0)
  // compose at full card size: blurred dark copy first (ground shadow), then the cloud
  const out = document.createElement('canvas'); out.width = CW * 2; out.height = CH
  const o = out.getContext('2d'); o.imageSmoothingQuality = 'high'
  const tint = document.createElement('canvas'); tint.width = W2; tint.height = H2
  const t = tint.getContext('2d'); t.drawImage(cv, 0, 0)
  t.globalCompositeOperation = 'source-in'; t.fillStyle = '#0a0f14'; t.fillRect(0, 0, W2, H2)
  for (const off of [0, CW]) {
    o.save(); o.filter = 'blur(4px)'; o.globalAlpha = 0.33
    o.drawImage(tint, 0, 0, W2, H2, off + 6, 8, CW, CH); o.restore()
  }
  for (const off of [0, CW]) o.drawImage(cv, 0, 0, W2, H2, off, 0, CW, CH)
  return out.toDataURL('image/png')
}

// Finance entry card: management only, renders nothing for everyone else so
// the dashboard is unchanged for pilots and mechanics. All figures NET USD,
// derived from what the app already captures (Finance Phase: entry point).
// Monies-style monochrome donut: grayscale slices, biggest first, drawn as
// stroke arcs on one circle. Purely presentational.
const DONUT_GRAYS = ['#f0f0f0', '#a8a8a8', '#787878', '#585858', '#404040']
function SpendDonut({ slices, size = 52 }) {
  const total = slices.reduce((s, x) => s + x.net, 0)
  const C = 2 * Math.PI * 15.5
  let offset = 0
  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size }}>
      <circle cx="20" cy="20" r="15.5" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
      {total > 0 && slices.map((s, i) => {
        const frac = s.net / total
        const el = (
          <circle key={s.kind} cx="20" cy="20" r="15.5" fill="none"
            stroke={DONUT_GRAYS[i % DONUT_GRAYS.length]} strokeWidth="6"
            strokeDasharray={`${Math.max(frac * C - 1.2, 0.4)} ${C}`}
            strokeDashoffset={-offset * C}
            transform="rotate(-90 20 20)" />
        )
        offset += frac
        return el
      })}
    </svg>
  )
}

function FinanceCard() {
  const navigate = useNavigate()
  const isManagement = useIsManagement()
  const { selectedAircraft } = useAircraft()
  const fin = useFinanceSummary(isManagement ? selectedAircraft?.id : null)
  const [period, setPeriod] = useState('all_time')
  if (!isManagement) return null
  const commercial = (selectedAircraft?.finance_mode ?? 'commercial') === 'commercial'
  const usd = n => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Period filter, Monies-style pills. Sums recomputed from the ledger
  // entries for the chosen window.
  const nowMonth  = new Date().toISOString().slice(0, 7)
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7) })()
  const inPeriod = e => {
    const m = (e.date ?? '').slice(0, 7)
    if (period === 'this_month') return m === nowMonth
    if (period === 'last_month') return m === lastMonth
    return true
  }
  const rows = fin.entries.filter(inPeriod)
  const income   = Math.round(rows.reduce((s, e) => s + ((e.net ?? 0) > 0 ? e.net : 0), 0) * 100) / 100
  const expenses = Math.abs(Math.round(rows.reduce((s, e) => s + ((e.net ?? 0) < 0 ? e.net : 0), 0) * 100) / 100)
  const netTotal = Math.round((income - expenses) * 100) / 100
  const eyebrow = period === 'all_time' ? 'Total liquid position'
    : period === 'this_month' ? 'Net · this month' : 'Net · last month'

  return (
    <div className="space-y-2.5">
      {/* Period pills, above the card like Monies */}
      <div className="flex gap-1.5 px-1">
        {[['all_time', 'All Time'], ['this_month', 'This Month'], ['last_month', 'Last Month']].map(([id, label]) => (
          <button key={id} onClick={() => setPeriod(id)}
            className={`px-4 py-2 rounded-full text-[13px] font-semibold transition-colors
              ${period === id ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50'}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="trow-group glass-card">
        <div className="p-3">
          <button className="vital-tile w-full items-center py-6" onClick={() => navigate('/finance')}>
            <p className="vital-label" style={{ letterSpacing: '0.18em' }}>{eyebrow}</p>
            <p className={`vital-value tracking-tight tabular-nums ${netTotal < 0 ? 'text-red-400' : ''}`}
              style={{ fontSize: 46 }}>
              {netTotal < 0 ? '−' : ''}{usd(netTotal)}
            </p>

            {/* Income / Expenses / Net, flat columns exactly like Monies */}
            <div className="w-full grid grid-cols-3 gap-2 mt-4">
              <div className="text-center">
                <p className="text-[13px] text-white/40 mb-0.5">Income</p>
                <p className={`text-[15px] font-bold font-mono tabular-nums ${income > 0 && commercial ? 'text-green-400' : 'text-white/50'}`}>
                  {usd(income)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-white/40 mb-0.5">Expenses</p>
                <p className="text-[15px] font-bold font-mono tabular-nums text-red-400">{usd(expenses)}</p>
              </div>
              <div className="text-center">
                <p className="text-[13px] text-white/40 mb-0.5">Net</p>
                <p className={`text-[15px] font-bold font-mono tabular-nums ${netTotal >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {netTotal < 0 ? '−' : ''}{usd(netTotal)}
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

// Live minimap preview: the real chart (same MapLibre engine and shared
// OpenFreeMap style as the Map screen) with the waypoint dots, non-interactive.
// Tapping it opens the full map.
function MiniMap({ height = 150 }) {
  const boxRef = useRef(null)
  const mapRef = useRef(null)
  const [ready, setReady] = useState(false)
  const { waypoints } = useWaypoints()
  const notams = useNotams()
  // two parallax cloud decks at the card's real pixel size, regenerated on
  // every mount (never the same sky). Deferred past first paint — the fBm
  // pixel loop takes ~0.5-1.5 s and the map should appear first; the decks
  // then fade in via the CSS animation on .minimap-clouds.
  const [cloudLayers, setCloudLayers] = useState(null)
  useEffect(() => {
    const el = boxRef.current
    if (!el?.clientWidth || !el?.clientHeight) return
    const W = el.clientWidth, H = el.clientHeight
    const id = setTimeout(() => {
      setCloudLayers([
        cloudDeck(W, H, 0.42, 0.030, 1,    Math.floor(Math.random() * 1e6)),
        cloudDeck(W, H, 0.50, 0.055, 0.75, Math.floor(Math.random() * 1e6)),
      ])
    }, 400)
    return () => clearTimeout(id)
  }, [])

  useEffect(() => {
    let map, cancelled = false
    loadStyle().then(style => {
      if (cancelled) return
      map = new maplibregl.Map({
        container: boxRef.current,
        style,
        center: SALVADOR_CENTER,
        zoom: 6.7,                 // whole country in frame
        interactive: false,
        attributionControl: false,
      })
      mapRef.current = map
      map.on('load', () => {
        // Satellite ground (same shared Esri module as the big map and the
        // route minimaps) — added first so the waypoint dots paint on top
        addEsriToMapLibre(map, { key: import.meta.env.VITE_ARCGIS_KEY || null, labels: true })
        // Active NOTAMs — same red dashed circles as the big chart, so the
        // dashboard preview warns at a glance
        map.addSource('notams', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'notam-fill', type: 'fill', source: 'notams',
          paint: { 'fill-color': '#E5484D', 'fill-opacity': 0.13 },
        })
        map.addLayer({
          id: 'notam-line', type: 'line', source: 'notams',
          paint: { 'line-color': '#E5484D', 'line-width': 1.6, 'line-dasharray': [3, 2] },
        })
        map.addSource('wp', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
        map.addLayer({
          id: 'wp-dots', type: 'circle', source: 'wp',
          paint: {
            'circle-radius': ['case', ['==', ['get', 'custom'], 1], 3.4, 1.7],
            'circle-color': ['case', ['==', ['get', 'custom'], 1], '#0E8F93', '#7A828A'],
            'circle-opacity': 0.85,
          },
        })
        setReady(true)
      })
    })
    return () => { cancelled = true; mapRef.current = null; map?.remove() }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.getSource('notams')?.setData({
      type: 'FeatureCollection',
      features: notams
        .filter(n => n.center_lat != null && n.center_lng != null && n.radius_nm)
        .map(n => ({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [notamCircle(n.center_lat, n.center_lng, n.radius_nm)] },
          properties: {},
        })),
    })
  }, [notams, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    map.getSource('wp')?.setData({
      type: 'FeatureCollection',
      features: waypoints.map(w => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [w.lng, w.lat] },
        properties: { custom: w.source === 'aip' ? 0 : 1 },
      })),
    })
  }, [waypoints, ready])

  return (
    <div className="absolute inset-0" style={{ height, isolation: 'isolate' }}>
      {/* position/inset inline — maplibre-gl.css sets position:relative on
          this node at init and would collapse a Tailwind-classed box */}
      <div ref={boxRef} style={{ position: 'absolute', inset: 0, background: '#EAE6DE' }} />
      {/* decorative drifting clouds — two parallax decks, purely cosmetic */}
      {cloudLayers && (
        <div className="minimap-clouds" aria-hidden="true">
          {/* seen from altitude: barely-perceptible drift */}
          <div className="minimap-cloud-layer" style={{ backgroundImage: `url(${cloudLayers[0]})`, animationDuration: '260s' }} />
          <div className="minimap-cloud-layer" style={{ backgroundImage: `url(${cloudLayers[1]})`, animationDuration: '430s' }} />
        </div>
      )}
    </div>
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
  <img src={HELICOPTER_ICON} alt="helicopter" className="w-5 h-5 object-contain opacity-50"
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
  const [detailFlight,        setDetailFlight]        = useState(null)
  const [detailOpen,          setDetailOpen]          = useState(false)
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

      <CrestHeader switcher />

      {/* ── Hero — the aircraft is the interface ── */}
      <button onClick={() => setHobbsHistoryOpen(true)} className="hero-stage block w-full select-none">
        <div className="hero-shadow" aria-hidden />
        <img src="/heli-hero.png" alt={selectedAircraft?.make_model ?? 'Bell 206B3 JetRanger'}
          className="hero-heli" draggable="false"
          onError={e => {
            // A dropped request paints iOS's "?" box forever — retry with a
            // cache-buster a few times instead of staying broken
            const img = e.currentTarget
            const tries = +(img.dataset.tries ?? 0)
            if (tries >= 5) return
            img.dataset.tries = tries + 1
            setTimeout(() => { img.src = `/heli-hero.png?retry=${tries + 1}` }, 1500 * (tries + 1))
          }} />
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
                    {stats.monthCount ? `+${stats.monthHours}` : '0h'}
                  </p>
                </div>
                <p className="vital-foot">{stats.monthCount ? `${stats.monthCount} flight${stats.monthCount === 1 ? '' : 's'}` : 'no flights'}</p>
              </button>
            </div>

            {/* Minimap — a tile like its siblings; the ops shortcuts float
                over the chart itself (tapping the chart opens the map) */}
            <div className="no-press relative block w-full overflow-hidden select-none rounded-[14px] cursor-pointer"
              style={{ height: 280, WebkitTapHighlightColor: 'transparent' }}
              onClick={() => navigate('/map')} role="button" aria-label="Open map and waypoints">
              <MiniMap height={280} />
              {/* dark veil: the clear chart dims to sit inside the dark UI */}
              <div className="absolute inset-0 pointer-events-none"
                style={{ background: 'rgba(14, 16, 18, 0.38)' }} />
              {/* readability scrim under the floating buttons */}
              <div className="absolute inset-x-0 bottom-0 h-20 pointer-events-none"
                style={{ background: 'linear-gradient(to top, rgba(17,17,18,0.75), transparent)' }} />

              {/* Ops shortcuts — the map screen's crystal buttons, riding the chart */}
              <div className="absolute inset-x-3 bottom-3 grid grid-cols-3 gap-2.5">
                {[
                  { label: 'Flight plan', go: () => window.open(AVIARA_URL, '_blank') },
                  { label: 'Quote',       go: () => navigate('/map', { state: { mode: 'quote' } }) },
                  { label: 'Trips',       go: () => navigate('/map', { state: { mode: 'trips' } }) },
                ].map(({ label, go }) => (
                  <button key={label}
                    onClick={e => { e.stopPropagation(); go() }}
                    className="rounded-[14px] py-3.5 flex items-center justify-center select-none active:scale-[0.98] transition-transform"
                    style={{
                      background: 'rgba(30,30,32,0.55)',
                      backdropFilter: 'blur(24px) saturate(180%)',
                      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                    }}>
                    <span className="text-[13px] font-semibold text-white leading-none">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Finance: its own card below the vitals, hero layout like Hobbs.
               Management only; renders nothing for everyone else. ── */}
        <FinanceCard />

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
                <div key={f.id} className="tile"
                  onClick={() => { setDetailFlight(f); setDetailOpen(true) }}>
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

      <FlightDetailSheet
        flight={detailFlight}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
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
