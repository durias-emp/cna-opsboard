import { useState, useEffect } from 'react'
import CrestHeader from '../components/CrestHeader'
import FlightDetailSheet from '../components/FlightDetailSheet'
import { useLocation } from 'react-router-dom'
import { toHobbs, formatDate } from '../lib/utils'
import { useAircraft } from '../context/AircraftContext'
import { useFlights } from '../hooks/useFlights'
import PageHeader from '../components/PageHeader'
import StatCard from '../components/StatCard'
import EmptyState from '../components/EmptyState'
import FlightDrawer from '../components/FlightDrawer'
import ItineraryDrawer from '../components/ItineraryDrawer'
import ItineraryRecordsDrawer from '../components/ItineraryRecordsDrawer'
import WeightBalanceCalculator from '../components/WeightBalanceCalculator'
import { HELICOPTER_ICON } from '../assets/navIcons'

const IconFlight = () => (
  <img src={HELICOPTER_ICON} alt="helicopter" className="w-5 h-5 object-contain opacity-50"
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

function FlightHeatmap({ flights, statsLine }) {
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
    return `rgba(44,185,189,${(0.22 + t * 0.72).toFixed(2)})`
  }

  return (
    <div className="glass-card rounded-2xl p-4 space-y-2">
      {/* Season stats — the headline, easy to read at a glance */}
      {statsLine && (
        <p className="text-[13.5px] font-semibold text-white/90 pb-1">{statsLine}</p>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="label">{qLabel}</p>
        <div className="flex items-center gap-1">
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>Less</span>
          {[0.07, 0.25, 0.45, 0.65, 0.88].map((op, i) => (
            <div key={i} style={{
              width: SQ, height: SQ, borderRadius: 2,
              backgroundColor: i === 0 ? `rgba(255,255,255,${op})` : `rgba(44,185,189,${op})`,
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


// ── Page ──────────────────────────────────────────────────────────────────────

export default function Flights() {
  const { selectedAircraft } = useAircraft()
  const { flights, loading, stats, refresh } = useFlights(selectedAircraft?.id)
  const location = useLocation()
  const [drawerOpen,       setDrawerOpen]       = useState(false)
  const [editMode,         setEditMode]         = useState(false)
  const [editingFlight,    setEditingFlight]    = useState(null)
  const [activeFilter,     setActiveFilter]     = useState(0)
  const [detailFlight,     setDetailFlight]     = useState(null)
  const [detailOpen,       setDetailOpen]       = useState(false)
  const [itineraryOpen,    setItineraryOpen]    = useState(false)
  const [recordsOpen,      setRecordsOpen]      = useState(false)
  const [editingItinerary, setEditingItinerary] = useState(null)
  const [wabOpen,          setWabOpen]          = useState(false)

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

  function exportFlightsCSV() {
    const headers = ['Date','Pilot','Copilot','From','To','Legs',
                     'Air Time (h)','Flight Time (h)','Cycles',
                     'Fuel Start (gal)','Fuel End (gal)','Notes']

    const rows = filtered.map(f => {
      const firstLeg = f.legs?.[0]
      const lastLeg  = f.legs?.[f.legs.length - 1]
      return [
        f.date,
        f.pilot       ?? '',
        f.copilot     ?? '',
        firstLeg?.takeoff_location ?? '',
        lastLeg?.landing_location  ?? '',
        f.legs?.length ?? 1,
        f.total_minutes       != null ? toHobbs(f.total_minutes).toFixed(1)       : '',
        f.flight_time_minutes != null ? toHobbs(f.flight_time_minutes).toFixed(1) : '',
        f.cycles      ?? '',
        f.fuel_start_gal ?? '',
        f.fuel_end_gal   ?? '',
        (f.notes ?? '').replace(/"/g, '""'),
      ]
    })

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const lines  = [headers, ...rows].map(r => r.map(escape).join(','))
    const csv    = lines.join('\n')
    const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href       = url
    const label  = activeFilter === 1 ? 'this-month' : activeFilter === 2 ? 'last-month' : 'all'
    a.download   = `flights-${selectedAircraft?.tail_number ?? 'log'}-${label}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Auto-open drawer when navigated here with openDrawer state
  useEffect(() => {
    if (location.state?.openDrawer) {
      setDrawerOpen(true)
      // Clear state so back-navigation doesn't re-open it
      window.history.replaceState({}, '')
    }
  }, [location.state])

  // Direct access from the dashboard: a Recent-flights tap lands here with the
  // flight id and its detail drawer opens immediately (waits for data load)
  useEffect(() => {
    const id = location.state?.openFlightId
    if (!id || !flights.length) return
    const f = flights.find(x => String(x.id) === String(id))
    if (f) { setDetailFlight(f); setDetailOpen(true) }
    window.history.replaceState({}, '')
  }, [location.state, flights])

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
    <div className="flex-1 overflow-y-auto nav-clearance page-ambience">

      <CrestHeader />
      <PageHeader
        title="Flights"
        sub={selectedAircraft?.tail_number}
        action={{ label: 'Log Flight', onClick: () => setDrawerOpen(true) }}
      />

      <div className="px-4 pb-6 space-y-5">

        {/* Heatmap */}
        {!loading && (
          <FlightHeatmap flights={flights}
            statsLine={`${stats.total} flights · ${stats.allHours} total · ${stats.monthHours} this month`} />
        )}

        {/* ── Itinerary & tools — Tesla-style rows ── */}
        <div className="trow-group">
          <button className="trow" onClick={() => setItineraryOpen(true)}>
            <p className="text-[14px] font-semibold text-white">Add New Itinerary</p>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="chev w-4 h-4"><path d="M12 5v14M5 12h14" /></svg>
          </button>
          <button className="trow" onClick={() => setRecordsOpen(true)}>
            <p className="text-[14px] font-semibold text-white">Itinerary Records</p>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="chev w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <button className="trow" onClick={() => setWabOpen(true)}>
            <p className="text-[14px] font-semibold text-white">Weight &amp; Balance</p>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="chev w-4 h-4"><path d="M9 18l6-6-6-6" /></svg>
          </button>
        </div>

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
          {/* Custom header with CSV + Edit buttons */}
          <div className="flex items-center justify-between mb-3">
            <p className="label">Flight log</p>
            <div className="flex items-center gap-2">
              <button
                onClick={exportFlightsCSV}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold
                           bg-white/[0.06] text-white/40 active:bg-white/[0.10] transition-colors select-none"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                CSV
              </button>
              <button
                onClick={toggleEditMode}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors select-none
                  ${editMode
                    ? 'bg-white text-black'
                    : 'text-accent active:opacity-70'}`}
              >
                {editMode ? 'Done' : 'Edit'}
              </button>
            </div>
          </div>

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
            <div className="tile-group glass-card">
              {filtered.map(flight => (
                <div
                  key={flight.id}
                  onClick={editMode
                    ? () => openEditFlight(flight)
                    : () => { setDetailFlight(flight); setDetailOpen(true) }}
                  className="tile"
                >
                  {editMode ? (
                    <div className="tile-icon !bg-white/[0.04]">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        strokeLinecap="round" className="w-4 h-4 text-white/50">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="tile-icon"><IconFlight /></div>
                  )}
                  <div className="tile-body">
                    <div className="min-w-0">
                      <p className="tile-title">{flightRoute(flight)}</p>
                      <p className="tile-sub">
                        {formatDate(flight.date)}
                        {flight.legs?.length > 1 && ` · ${flight.legs.length} legs`}
                      </p>
                    </div>
                    {editMode ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        strokeLinecap="round" className="w-4 h-4 text-white/20 flex-shrink-0">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    ) : (
                      <p className="tile-value">{formatDuration(flight.total_minutes)}</p>
                    )}
                  </div>
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

      <ItineraryDrawer
        open={itineraryOpen}
        onClose={() => { setItineraryOpen(false); setEditingItinerary(null) }}
        onSaved={() => {}}
        editRecord={editingItinerary}
      />

      <ItineraryRecordsDrawer
        open={recordsOpen}
        onClose={() => setRecordsOpen(false)}
        onEdit={record => {
          setEditingItinerary(record)
          setRecordsOpen(false)
          setItineraryOpen(true)
        }}
      />

      {wabOpen && <WeightBalanceCalculator onClose={() => setWabOpen(false)} />}
    </div>
  )
}
