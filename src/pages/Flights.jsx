import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import SectionHeader from '../components/SectionHeader'
import EmptyState from '../components/EmptyState'
import FlightDrawer from '../components/FlightDrawer'

const IconFlight = () => (
  <img src="/helicopter.png" alt="helicopter" className="w-5 h-5 object-contain opacity-50"
    style={{ filter: 'brightness(0) invert(1)' }} />
)
const IconClock = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
  </svg>
)
const IconCalendar = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
    <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
)

const FILTERS = ['All', 'This month', 'Last month']

function formatDate(iso) {
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

const toHobbs = mins => Math.floor(mins / 6) / 10

function formatDuration(mins) {
  if (!mins) return '—'
  return `${toHobbs(mins).toFixed(1)}h`
}

function flightRoute(flight) {
  const first = flight.legs?.[0]
  const last = flight.legs?.[flight.legs.length - 1]
  if (!first?.takeoff_location || !last?.landing_location) return '—'
  return `${first.takeoff_location} → ${last.landing_location}`
}

// ── Flight Heatmap — current quarter, no scroll ───────────────────────────────

const DOW_LABEL = ['', 'Mon', '', 'Wed', '', 'Fri', '']
const SQ  = 12
const GAP = 3

function FlightHeatmap({ flights }) {
  const now      = new Date()
  const _ld = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayStr = _ld(now)
  const year     = now.getFullYear()
  const month    = now.getMonth()
  const [tooltip, setTooltip] = useState(null)

  // Current quarter bounds
  const qStart = Math.floor(month / 3) * 3          // 0, 3, 6, 9
  const qEnd   = qStart + 2
  const qLabel = `Q${Math.floor(month / 3) + 1} ${year}`

  const quarterStart = new Date(year, qStart, 1)
  const quarterEnd   = new Date(year, qEnd + 1, 0)  // last day of quarter

  // Snap start back to Sunday
  const gridStart = new Date(quarterStart)
  gridStart.setDate(gridStart.getDate() - gridStart.getDay())

  // hours + flights per day
  const hoursPerDay   = {}
  const flightsPerDay = {}
  flights.forEach(f => {
    if (!f.date || !f.total_minutes) return
    hoursPerDay[f.date]   = (hoursPerDay[f.date] || 0) + toHobbs(f.total_minutes)
    flightsPerDay[f.date] = [...(flightsPerDay[f.date] || []), f]
  })
  const maxHours = Math.max(...Object.values(hoursPerDay), 0.1)

  function handleCellTap(e, cell) {
    if (!cell.inQ || !cell.isPast) return
    const h = hoursPerDay[cell.dateStr] || 0
    if (h === 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    setTooltip({
      dateStr:    cell.dateStr,
      x:          rect.left + rect.width / 2,
      y:          rect.top,
      hours:      h,
      dayFlights: flightsPerDay[cell.dateStr] || [],
    })
  }

  // Build week columns
  const weeks       = []
  const monthLabels = []
  const cursor      = new Date(gridStart)

  while (cursor <= quarterEnd) {
    const weekIdx = weeks.length
    const week    = []
    for (let d = 0; d < 7; d++) {
      const dateStr  = _ld(cursor)
      const inQ      = cursor >= quarterStart && cursor <= quarterEnd
      const isPast   = cursor <= now
      if (inQ && cursor.getDate() === 1) {
        monthLabels.push({
          weekIdx,
          label: cursor.toLocaleDateString('en-CA', { month: 'short' }),
        })
      }
      week.push({ dateStr, inQ, isPast, isToday: dateStr === todayStr })
      cursor.setDate(cursor.getDate() + 1)
    }
    weeks.push(week)
  }

  function cellBg(cell) {
    if (!cell.inQ)     return 'transparent'
    if (!cell.isPast)  return 'rgba(255,255,255,0.04)'
    const h = hoursPerDay[cell.dateStr] || 0
    if (h === 0)       return 'rgba(255,255,255,0.07)'
    const t = Math.min(h / maxHours, 1)
    return `rgba(74,222,128,${(0.22 + t * 0.72).toFixed(2)})`
  }

  return (
    <div className="card space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="label">{qLabel}</p>
        <div className="flex items-center gap-1">
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>Less</span>
          {[0.07, 0.25, 0.45, 0.65, 0.88].map((op, i) => (
            <div key={i} style={{
              width: SQ, height: SQ, borderRadius: 2,
              backgroundColor: i === 0 ? `rgba(255,255,255,${op})` : `rgba(74,222,128,${op})`,
            }} />
          ))}
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>More</span>
        </div>
      </div>

      {/* Grid — full card width, small squares centred in each column */}
      <div style={{ display: 'flex', width: '100%', gap: GAP }}>

        {/* Mon / Wed / Fri labels */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, paddingTop: 16, flexShrink: 0 }}>
          {DOW_LABEL.map((lbl, i) => (
            <div key={i} style={{ height: SQ, display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.28)', whiteSpace: 'nowrap', paddingRight: 4, lineHeight: 1 }}>
                {lbl}
              </span>
            </div>
          ))}
        </div>

        {/* Weeks — stretch to fill */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Month labels */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${weeks.length}, 1fr)`, marginBottom: 4, height: 13 }}>
            {weeks.map((_, wi) => {
              const ml = monthLabels.find(m => m.weekIdx === wi)
              return (
                <div key={wi} style={{ position: 'relative', overflow: 'visible' }}>
                  {ml && (
                    <span style={{ position: 'absolute', fontSize: 9, color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap', lineHeight: 1 }}>
                      {ml.label}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Day rows */}
          {[0, 1, 2, 3, 4, 5, 6].map(dow => (
            <div key={dow} style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${weeks.length}, 1fr)`,
              marginBottom: dow < 6 ? GAP : 0,
            }}>
              {weeks.map((week, wi) => {
                const cell = week[dow]
                return (
                  <div key={wi} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                    onClick={e => handleCellTap(e, cell)}>
                    <div style={{
                      width: SQ, height: SQ, borderRadius: 2, flexShrink: 0,
                      backgroundColor: cellBg(cell),
                      outline: cell.isToday ? '1px solid rgba(255,255,255,0.55)' : 'none',
                      outlineOffset: 1,
                      cursor: (cell.inQ && cell.isPast && hoursPerDay[cell.dateStr]) ? 'pointer' : 'default',
                    }} />
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Tooltip */}
      {tooltip && (
        <>
          {/* Dismiss backdrop */}
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 190 }}
            onClick={() => setTooltip(null)}
          />
          {/* Floating card */}
          <div style={{
            position:  'fixed',
            left:      tooltip.x,
            top:       tooltip.y - 10,
            transform: 'translate(-50%, -100%)',
            zIndex:    200,
            pointerEvents: 'none',
          }}>
            <div className="bg-navy-800 border border-white/10 rounded-2xl px-3 py-2.5 shadow-2xl"
              style={{ minWidth: 140 }}>
              {/* Date */}
              <p className="text-[10px] text-white/40 mb-1">
                {new Date(tooltip.dateStr + 'T12:00:00').toLocaleDateString('en-CA', {
                  weekday: 'short', month: 'short', day: 'numeric',
                })}
              </p>
              {/* Hours */}
              <p className="text-sm font-bold text-white">
                {tooltip.hours.toFixed(1)}h flown
              </p>
              {/* Flights */}
              <p className="text-[10px] text-white/40 mt-0.5">
                {tooltip.dayFlights.length} flight{tooltip.dayFlights.length !== 1 ? 's' : ''}
              </p>
              {/* Routes */}
              {tooltip.dayFlights.map((f, i) => {
                const first = f.legs?.[0]
                const last  = f.legs?.[f.legs.length - 1]
                const route = first?.takeoff_location && last?.landing_location
                  ? `${first.takeoff_location} → ${last.landing_location}`
                  : null
                return route ? (
                  <div key={i} className="flex items-center justify-between gap-3 mt-0.5">
                    <p className="text-[10px] text-white/60 font-medium">{route}</p>
                    <p className="text-[10px] text-white/35 flex-shrink-0">{formatDuration(f.total_minutes)}</p>
                  </div>
                ) : null
              })}
              {/* Arrow */}
              <div style={{
                position: 'absolute', bottom: -5, left: '50%',
                transform: 'translateX(-50%)',
                width: 0, height: 0,
                borderLeft:  '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop:   '5px solid rgba(255,255,255,0.10)',
              }} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Flight Detail Sheet ───────────────────────────────────────────────────────

function FlightDetailSheet({ flight, open, onClose }) {
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
                <div key={i} className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06]">
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
              <div className="bg-white/[0.04] rounded-2xl px-4 py-3 border border-white/[0.06]">
                <p className="text-sm font-semibold text-white">{flight.pilot}</p>
              </div>
            </div>
          )}

          {/* Passengers */}
          {flight.passengers?.length > 0 && (
            <div>
              <p className="label mb-3">Passenger manifest</p>
              <div className="bg-white/[0.04] rounded-2xl border border-white/[0.06] overflow-hidden">
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
                  <div className="flex items-center justify-between px-4 py-2.5 border-t border-white/[0.08] bg-white/[0.02]">
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
              <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06]">
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
              <div className="bg-white/[0.04] rounded-2xl px-4 py-3 border border-white/[0.06]">
                <p className="text-sm text-white/70 leading-relaxed">{flight.notes}</p>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Flights() {
  const { selectedAircraft } = useAircraft()
  const { flights, loading, stats, refresh } = useFlights(selectedAircraft?.id)
  const location = useLocation()
  const [drawerOpen,     setDrawerOpen]     = useState(false)
  const [editMode,       setEditMode]       = useState(false)
  const [editingFlight,  setEditingFlight]  = useState(null)
  const [activeFilter,   setActiveFilter]   = useState(0)
  const [detailFlight,   setDetailFlight]   = useState(null)
  const [detailOpen,     setDetailOpen]     = useState(false)

  function openEditFlight(flight) {
    setEditingFlight(flight)
    setDrawerOpen(true)
  }

  function handleDrawerClose() {
    setDrawerOpen(false)
    setEditingFlight(null)
  }

  function toggleEditMode() {
    setEditMode(v => !v)
    setEditingFlight(null)
  }

  // Auto-open drawer when navigated here with openDrawer state
  useEffect(() => {
    if (location.state?.openDrawer) {
      setDrawerOpen(true)
      // Clear state so back-navigation doesn't re-open it
      window.history.replaceState({}, '')
    }
  }, [location.state])

  const now = new Date()
  const _ld2       = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const monthStart     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  const _lm            = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthStart = `${_lm.getFullYear()}-${String(_lm.getMonth() + 1).padStart(2, '0')}-01`

  const filtered = flights.filter(f => {
    if (activeFilter === 1) return f.date >= monthStart
    if (activeFilter === 2) return f.date >= lastMonthStart && f.date < monthStart
    return true
  })

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">
      <PageHeader
        title="Flights"
        sub={selectedAircraft?.tail_number}
        action={{ label: 'Log Flight', onClick: () => setDrawerOpen(true) }}
      />

      <div className="px-4 pb-6 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={<IconFlight />}   label="Total"      value={loading ? '…' : stats.total}    accent />
          <StatCard icon={<IconClock />}    label="Hours"      value={loading ? '…' : stats.allHours} />
          <StatCard icon={<IconCalendar />} label="This month" value={loading ? '…' : stats.monthHours} />
        </div>

        {/* Heatmap */}
        {!loading && flights.length > 0 && (
          <FlightHeatmap flights={flights} />
        )}

        {/* Filters */}
        <div className="flex gap-2">
          {FILTERS.map((f, i) => (
            <button
              key={f}
              onClick={() => setActiveFilter(i)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors select-none
                ${i === activeFilter
                  ? 'bg-white/10 text-white border-white/15'
                  : 'bg-transparent text-white/35 border-white/[0.07]'}`}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Flight list */}
        <div>
          <SectionHeader
            title="Flight log"
            action={{ label: editMode ? 'Done' : 'Edit', onClick: toggleEditMode }}
          />

          {loading ? (
            <div className="space-y-3">
              {[1, 2].map(i => (
                <div key={i} className="card animate-pulse h-16" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<IconFlight />}
              message="No flights logged yet. Tap Log Flight to add your first entry."
              action={{ label: 'Log Flight', onClick: () => setDrawerOpen(true) }}
            />
          ) : (
            <div className="card p-0 overflow-hidden">
              {filtered.map((flight, i) => (
                <div
                  key={flight.id}
                  onClick={editMode
                    ? () => openEditFlight(flight)
                    : () => { setDetailFlight(flight); setDetailOpen(true) }}
                  className={`flex items-center justify-between px-4 py-3.5 gap-3 cursor-pointer active:bg-white/[0.03]
                    ${i < filtered.length - 1 ? 'border-b border-white/[0.05]' : ''}`}
                >
                  {/* Edit mode left indicator */}
                  {editMode && (
                    <div className="w-5 h-5 rounded-full border-2 border-white/20 flex-shrink-0
                                    flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                        strokeLinecap="round" className="w-3 h-3 text-white/40">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </div>
                  )}
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center
                                    justify-center text-white/40 flex-shrink-0">
                      <IconFlight />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{flightRoute(flight)}</p>
                      <p className="text-[11px] text-white/35 mt-0.5">
                        {formatDate(flight.date)}
                        {flight.legs?.length > 1 && ` · ${flight.legs.length} legs`}
                      </p>
                    </div>
                  </div>
                  {editMode ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      strokeLinecap="round" className="w-4 h-4 text-white/20 flex-shrink-0">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  ) : (
                    <p className="text-sm font-medium text-white/60 flex-shrink-0">
                      {formatDuration(flight.total_minutes)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <FlightDrawer
        open={drawerOpen}
        onClose={handleDrawerClose}
        onSaved={refresh}
        editFlight={editingFlight}
      />

      <FlightDetailSheet
        flight={detailFlight}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  )
}
