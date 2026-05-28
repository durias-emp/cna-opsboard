import { useState, useRef } from 'react'
import { formatDate } from '../lib/utils'
import { useAircraft } from '../context/AircraftContext'
import { useMaintenance, FLUID_TYPES } from '../hooks/useMaintenance'
import { useMaintenanceItems } from '../hooks/useMaintenanceItems'
import PageHeader from '../components/PageHeader'
import MaintenanceDrawer from '../components/MaintenanceDrawer'
import ComplianceDrawer from '../components/ComplianceDrawer'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function daysRemaining(dueDateStr) {
  if (!dueDateStr) return null
  const due = new Date(dueDateStr + 'T12:00:00')
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  return Math.round((due - now) / (1000 * 60 * 60 * 24))
}

// ─────────────────────────────────────────────────────────────────────────────
// Icons
// ─────────────────────────────────────────────────────────────────────────────

const IconChevron = ({ open }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" className={`w-4 h-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

const IconWrench = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
  </svg>
)

const IconDrop = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
  </svg>
)

// ─────────────────────────────────────────────────────────────────────────────
// Status config
// ─────────────────────────────────────────────────────────────────────────────

const STATUS = {
  overdue:      { label: 'OVERDUE',     dot: 'bg-red-400',     text: 'text-red-400',     bg: 'bg-white/[0.04]', border: 'border-white/[0.06]' },
  due_soon:     { label: 'DUE SOON',    dot: 'bg-amber-400',   text: 'text-amber-400',   bg: 'bg-white/[0.04]', border: 'border-white/[0.06]' },
  ok:           { label: 'OK',          dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-white/[0.04]', border: 'border-white/[0.06]' },
  on_condition:   { label: 'ON CONDITION', dot: 'bg-white/30',   text: 'text-white/40',   bg: 'bg-white/[0.04]', border: 'border-white/[0.06]' },
  not_applicable: { label: 'N/A',          dot: 'bg-white/15',   text: 'text-white/30',   bg: 'bg-white/[0.02]', border: 'border-white/[0.04]' },
}

// ─────────────────────────────────────────────────────────────────────────────
// Item card
// ─────────────────────────────────────────────────────────────────────────────

function ItemCard({ item, onLogCompliance }) {
  const [expanded, setExpanded] = useState(false)
  const s = STATUS[item.status] ?? STATUS.ok

  // Primary remaining value to show on the card (most urgent clock)
  function primaryRemaining() {
    if (item.status === 'on_condition' || item.status === 'not_applicable') return null

    // Pick the most urgent clock to surface
    const clocks = []
    if (item.hrsRemaining  != null) clocks.push({ type: 'hrs',  val: item.hrsRemaining })
    if (item.mthsRemaining != null) clocks.push({ type: 'mth',  val: item.mthsRemaining })
    if (item.cycsRemaining != null) clocks.push({ type: 'cyc',  val: item.cycsRemaining })

    if (!clocks.length) return null
    // Sort: most urgent (lowest) first
    clocks.sort((a, b) => a.val - b.val)
    return clocks[0]
  }

  const primary = primaryRemaining()
  const isOverdue = item.status === 'overdue'

  function remainingLabel(clock) {
    if (!clock) return null
    const abs = Math.abs(clock.val)
    if (clock.type === 'hrs') return isOverdue
      ? `${abs.toFixed(1)} hrs overdue`
      : `${abs.toFixed(1)} hrs left`
    if (clock.type === 'mth') {
      if (isOverdue) return `${abs} mo overdue`
      if (clock.val === 0) {
        const days = daysRemaining(item.due_date)
        return days != null ? `${days} days left` : '< 1 mo left'
      }
      return `${abs} mo left`
    }
    if (clock.type === 'cyc') return isOverdue
      ? `${abs} cycles overdue`
      : `${abs} cycles left`
  }

  return (
    <div className={`rounded-2xl border overflow-hidden ${s.border} ${s.bg}`}>
      {/* Summary row */}
      <button
        className="w-full flex items-center justify-between px-4 py-3.5 gap-3 text-left select-none active:opacity-70"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white leading-snug">{item.description}</p>
            {primary ? (
              <p className={`text-[11px] mt-0.5 font-medium ${s.text}`}>{remainingLabel(primary)}</p>
            ) : item.status === 'not_applicable' ? (
              <p className="text-[11px] mt-0.5 text-white/25">Not applicable to this aircraft</p>
            ) : item.trackAcHours != null ? (
              <p className="text-[11px] mt-0.5 text-white/30">{item.trackAcHours.toLocaleString()}h total · {item.trackOhHours.toLocaleString()}h since OH</p>
            ) : (
              <p className="text-[11px] mt-0.5 text-white/30">No numeric limit</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-full bg-white/[0.06] text-white/40 border border-white/[0.08]">
            {s.label}
          </span>
          <span className="text-white/20"><IconChevron open={expanded} /></span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06]">

          {/* Clocks row */}
          <div className="grid grid-cols-3 gap-2 pt-3">
            {item.due_at_hours != null && (
              <div>
                <p className="text-[10px] text-white/30 mb-0.5">Hours remaining</p>
                <p className={`text-sm font-bold ${item.hrsRemaining <= 0 ? s.text : 'text-white'}`}>
                  {item.hrsRemaining > 0 ? item.hrsRemaining.toFixed(1) : `−${Math.abs(item.hrsRemaining).toFixed(1)}`}
                  <span className="text-[10px] font-normal text-white/30 ml-0.5">h</span>
                </p>
                <p className="text-[10px] text-white/25">Due @ {item.due_at_hours?.toLocaleString()}h</p>
              </div>
            )}
            {item.due_date != null && (() => {
              const days = daysRemaining(item.due_date)
              const showDays = item.mthsRemaining === 0 && days != null && days >= 0
              return (
                <div>
                  <p className="text-[10px] text-white/30 mb-0.5">
                    {showDays ? 'Days remaining' : 'Months remaining'}
                  </p>
                  <p className={`text-sm font-bold ${item.mthsRemaining <= 0 ? s.text : 'text-white'}`}>
                    {showDays
                      ? days
                      : item.mthsRemaining > 0
                        ? item.mthsRemaining
                        : `−${Math.abs(item.mthsRemaining)}`}
                    <span className="text-[10px] font-normal text-white/30 ml-0.5">
                      {showDays ? 'd' : 'mo'}
                    </span>
                  </p>
                  <p className="text-[10px] text-white/25">{formatDate(item.due_date)}</p>
                </div>
              )
            })()}
            {item.due_at_cycles != null && (
              <div>
                <p className="text-[10px] text-white/30 mb-0.5">Cycles remaining</p>
                <p className={`text-sm font-bold ${item.cycsRemaining <= 0 ? s.text : 'text-white'}`}>
                  {item.cycsRemaining > 0 ? item.cycsRemaining.toLocaleString() : `−${Math.abs(item.cycsRemaining).toLocaleString()}`}
                  <span className="text-[10px] font-normal text-white/30 ml-0.5">cyc</span>
                </p>
                <p className="text-[10px] text-white/25">Due @ {item.due_at_cycles?.toLocaleString()}</p>
              </div>
            )}
            {item.status === 'on_condition' && !item.trackAcHours && (
              <div className="col-span-3">
                <p className="text-xs text-white/30">Monitored on condition — no numeric retirement limit.</p>
              </div>
            )}
            {item.trackAcHours != null && (
              <div className="col-span-3 flex items-center justify-between bg-white/[0.03] rounded-xl px-3 py-2.5">
                <div className="text-center">
                  <p className="text-[10px] text-white/30 mb-0.5">Total AC Hours</p>
                  <p className="text-sm font-bold text-white">
                    {item.trackAcHours.toLocaleString()}
                    <span className="text-[10px] font-normal text-white/30 ml-0.5">h</span>
                  </p>
                </div>
                <div className="w-px h-8 bg-white/[0.08]" />
                <div className="text-center">
                  <p className="text-[10px] text-white/30 mb-0.5">Since Overhaul</p>
                  <p className="text-sm font-bold text-white">
                    {item.trackOhHours.toLocaleString()}
                    <span className="text-[10px] font-normal text-white/30 ml-0.5">h</span>
                  </p>
                </div>
                <div className="w-px h-8 bg-white/[0.08]" />
                <div className="text-center">
                  <p className="text-[10px] text-white/30 mb-0.5">Limit</p>
                  <p className="text-sm font-bold text-white/40">O.C</p>
                </div>
              </div>
            )}
          </div>

          {/* Meta */}
          <div className="space-y-1.5 pt-1 border-t border-white/[0.05]">
            {/* Interval */}
            {(item.hours_interval || item.calendar_interval_months || item.cycles_interval) && (() => {
              const parts = []
              if (item.hours_interval)            parts.push(`${item.hours_interval} hrs`)
              if (item.calendar_interval_months)  parts.push(`${item.calendar_interval_months} months`)
              if (item.cycles_interval)           parts.push(`${item.cycles_interval} cycles`)
              return (
                <p className="text-[11px] text-white/30">
                  Interval: <span className="text-white/50">Every {parts.join(' / ')}</span>
                </p>
              )
            })()}
            {item.reference    && <p className="text-[11px] text-white/30">Ref: <span className="text-white/50">{item.reference}</span></p>}
            {item.part_number  && <p className="text-[11px] text-white/30">P/N: <span className="text-white/50 font-mono">{item.part_number}</span></p>}
            {item.serial_number&& <p className="text-[11px] text-white/30">S/N: <span className="text-white/50 font-mono">{item.serial_number}</span></p>}
            {item.event_type   && <p className="text-[11px] text-white/30">Event: <span className="text-white/50">{item.event_type}</span></p>}
            {item.last_complied_date && (
              <p className="text-[11px] text-white/30">Last complied: <span className="text-white/50">{formatDate(item.last_complied_date)} · {item.last_complied_hours?.toLocaleString()}h</span></p>
            )}
            {item.notes && <p className="text-[11px] text-white/30 italic">{item.notes}</p>}
          </div>

          {/* Log compliance button */}
          {item.status !== 'on_condition' && item.status !== 'not_applicable' && (
            <button
              onClick={() => onLogCompliance(item)}
              className="w-full py-2.5 rounded-xl bg-white/[0.06] border border-white/10
                         text-xs font-semibold text-white/70 active:bg-white/10 transition-colors"
            >
              Log Compliance
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Status group
// ─────────────────────────────────────────────────────────────────────────────

function StatusGroup({ status, items, onLogCompliance, defaultOpen = false, forceOpen = false, scrollRef }) {
  const [open, setOpen] = useState(defaultOpen)
  const s = STATUS[status]
  if (!items.length) return null
  const isOpen = forceOpen || open

  return (
    <div ref={scrollRef} className="space-y-2">
      <button
        className="w-full flex items-center justify-between py-1 select-none"
        onClick={() => setOpen(o => !o)}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${s.dot}`} />
          <span className={`text-xs font-bold tracking-wide uppercase ${s.text}`}>{s.label}</span>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded-full bg-white/[0.06] text-white/40">{items.length}</span>
        </div>
        <span className="text-white/20"><IconChevron open={open} /></span>
      </button>

      {isOpen && (
        <div className="space-y-2">
          {items.map(item => (
            <ItemCard key={item.id} item={item} onLogCompliance={onLogCompliance} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Fluid card (kept from old page)
// ─────────────────────────────────────────────────────────────────────────────

function FluidCard({ type, status, onAdd }) {
  const { last, hoursSince } = status
  const label = FLUID_TYPES[type].label

  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 flex items-center justify-between">
      <div>
        <p className="text-sm font-semibold text-white">{label}</p>
        {last ? (
          <p className="text-[11px] text-white/35 mt-0.5">
            {formatDate(last.date)} · {hoursSince != null ? `${hoursSince}h ago` : '—'}
          </p>
        ) : (
          <p className="text-[11px] text-white/25 mt-0.5">No service logged</p>
        )}
      </div>
      <button
        onClick={onAdd}
        className="text-xs text-white/50 border border-white/10 rounded-full px-3 py-1.5
                   active:bg-white/5 transition-colors select-none flex-shrink-0 ml-3"
      >
        + Log
      </button>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Filter chips
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS = [
  { id: 'all',      label: 'All' },
  { id: 'periodic', label: 'Periodic' },
  { id: 'airframe', label: 'Airframe' },
  { id: 'engine',   label: 'Engine' },
  { id: 'fluids',   label: 'Fluids' },
]

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Maintenance() {
  const { selectedAircraft } = useAircraft()
  const hobbs  = selectedAircraft?.hobbs_current  ?? 0
  const cycles = selectedAircraft?.cycles_current ?? 0

  const maint      = useMaintenance(selectedAircraft?.id, hobbs)
  const maintItems = useMaintenanceItems(selectedAircraft?.id, hobbs, cycles)

  const [filter,        setFilter]        = useState('all')
  const [search,        setSearch]        = useState('')
  const [complianceItem,setComplianceItem]= useState(null)
  const [compOpen,      setCompOpen]      = useState(false)
  const [fluidDrawer,   setFluidDrawer]   = useState(false)
  const [fluidType,     setFluidType]     = useState('engine_oil')
  const [forcedOpen,    setForcedOpen]    = useState({})
  const [snagOpen,      setSnagOpen]      = useState(false)

  const overdueRef  = useRef(null)
  const dueSoonRef  = useRef(null)
  const okRef       = useRef(null)
  const pageRef     = useRef(null)

  function openCompliance(item) {
    setComplianceItem(item)
    setCompOpen(true)
  }

  function openFluid(type) {
    setFluidType(type)
    setFluidDrawer(true)
  }

  function handleSummaryTap(status) {
    setForcedOpen(prev => ({ ...prev, [status]: true }))
    const ref = status === 'overdue' ? overdueRef : status === 'due_soon' ? dueSoonRef : okRef
    setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  // Filter items by category + search
  function filteredGroups() {
    if (filter === 'fluids') return null
    const byCategory = filter === 'all' ? maintItems.items : maintItems.byCategory(filter)
    const source = search.trim()
      ? byCategory.filter(i => i.description.toLowerCase().includes(search.trim().toLowerCase()))
      : byCategory
    return {
      overdue:     source.filter(i => i.status === 'overdue'),
      dueSoon:     source.filter(i => i.status === 'due_soon'),
      ok:          source.filter(i => i.status === 'ok'),
      onCondition:   source.filter(i => i.status === 'on_condition'),
      notApplicable: source.filter(i => i.status === 'not_applicable'),
    }
  }

  const groups = filteredGroups()

  // Summary counts for header
  const totalOverdue  = maintItems.overdue.length
  const totalDueSoon  = maintItems.dueSoon.length

  return (
    <div ref={pageRef} className="flex-1 overflow-y-auto nav-clearance">

      {/* ── Hero: blueprint + summary cards ── */}
      <div className="relative">

        {/* Page title */}
        <div className="flex items-center justify-between px-4 pt-5 pb-2">
          <div>
            <h1 className="page-title">Maintenance</h1>
            <p className="text-xs text-white/35 mt-0.5">
              {selectedAircraft?.tail_number} · {hobbs.toLocaleString()}h · {cycles.toLocaleString()} cyc
            </p>
          </div>
          <button className="fab" onClick={() => setSnagOpen(true)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
              strokeLinecap="round" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Snag List
          </button>
        </div>

        {/* Helicopter blueprint — screen blend makes black bg transparent.
            clip-path trims the bottom-right Gemini watermark. */}
        <div className="w-4/5 mx-auto mt-4 mb-6"
          style={{ backgroundColor: '#0A0A0A', isolation: 'isolate' }}>
          <img
            src="/Bell206 Jetranger.png"
            alt="Bell 206 blueprint"
            className="w-full object-contain select-none pointer-events-none"
            style={{
              opacity: 0.32,
              mixBlendMode: 'screen',
              clipPath: 'inset(0 0 10% 0)',
            }}
          />
        </div>
      </div>

      {/* ── 3 Summary cards ── */}
      <div className="px-4 mt-3 grid grid-cols-3 gap-2.5 relative z-10">

        {/* Overdue */}
        <button
          onClick={() => handleSummaryTap('overdue')}
          className="rounded-2xl bg-white/[0.05] border border-red-400/20 p-3.5 text-left active:scale-95 transition-transform select-none"
        >
          <p className="text-2xl font-bold text-red-400 leading-none">{maintItems.overdue.length}</p>
          <p className="text-[11px] font-semibold text-red-400/70 mt-1.5 uppercase tracking-wide">Overdue</p>
        </button>

        {/* Due Soon */}
        <button
          onClick={() => handleSummaryTap('due_soon')}
          className="rounded-2xl bg-white/[0.05] border border-amber-400/20 p-3.5 text-left active:scale-95 transition-transform select-none"
        >
          <p className="text-2xl font-bold text-amber-400 leading-none">{maintItems.dueSoon.length}</p>
          <p className="text-[11px] font-semibold text-amber-400/70 mt-1.5 uppercase tracking-wide">Due Soon</p>
        </button>

        {/* OK */}
        <button
          onClick={() => handleSummaryTap('ok')}
          className="rounded-2xl bg-white/[0.05] border border-emerald-400/20 p-3.5 text-left active:scale-95 transition-transform select-none"
        >
          <p className="text-2xl font-bold text-emerald-400 leading-none">{maintItems.ok.length}</p>
          <p className="text-[11px] font-semibold text-emerald-400/70 mt-1.5 uppercase tracking-wide">OK</p>
        </button>
      </div>

      {/* ── Search + filters ── */}
      <div className="px-4 pt-4 pb-2">
        {/* Search bar */}
        <div className="relative">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
            strokeLinecap="round" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 pointer-events-none">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search maintenance items…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/[0.06] border border-white/[0.08] rounded-2xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-white/25 outline-none focus:border-white/20"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 active:text-white/50"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" className="w-3.5 h-3.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          )}
        </div>

        {/* Filter chips — single row, horizontal scroll */}
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1 scrollbar-hide">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs font-semibold px-3.5 py-1.5 rounded-full border transition-colors select-none
                ${filter === f.id
                  ? 'bg-white text-black border-white'
                  : 'bg-white/[0.05] text-white/50 border-white/10 active:bg-white/10'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-6 space-y-4 mt-3">

        {/* ── Maintenance items ── */}
        {filter !== 'fluids' && (
          <>
            {maintItems.loading ? (
              [1,2,3].map(i => <div key={i} className="rounded-2xl bg-white/[0.04] animate-pulse h-14" />)
            ) : (
              <>
                <StatusGroup status="overdue"        items={groups.overdue}        onLogCompliance={openCompliance} defaultOpen={true}  forceOpen={!!search.trim() || !!forcedOpen.overdue}   scrollRef={overdueRef} />
                <StatusGroup status="due_soon"       items={groups.dueSoon}        onLogCompliance={openCompliance} defaultOpen={true}  forceOpen={!!search.trim() || !!forcedOpen.due_soon}  scrollRef={dueSoonRef} />
                <StatusGroup status="ok"             items={groups.ok}             onLogCompliance={openCompliance} defaultOpen={false} forceOpen={!!search.trim() || !!forcedOpen.ok}        scrollRef={okRef} />
                <StatusGroup status="on_condition"   items={groups.onCondition}    onLogCompliance={openCompliance} defaultOpen={false} forceOpen={!!search.trim()} />
                <StatusGroup status="not_applicable" items={groups.notApplicable}  onLogCompliance={openCompliance} defaultOpen={false} forceOpen={!!search.trim()} />

                {groups.overdue.length === 0 && groups.dueSoon.length === 0 &&
                 groups.ok.length === 0 && groups.onCondition.length === 0 && (
                  <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center py-12">
                    <p className="text-xs text-white/25">No items in this category</p>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ── Fluids ── */}
        {(filter === 'all' || filter === 'fluids') && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 py-1">
              <span className="text-white/20"><IconDrop /></span>
              <span className="text-xs font-bold tracking-wide uppercase text-white/40">Fluids</span>
            </div>

            {maint.loading ? (
              [1,2,3].map(i => <div key={i} className="rounded-2xl bg-white/[0.04] animate-pulse h-14" />)
            ) : (
              Object.keys(FLUID_TYPES).map(type => (
                <FluidCard
                  key={type}
                  type={type}
                  status={maint.getFluidStatus(type)}
                  onAdd={() => openFluid(type)}
                />
              ))
            )}

            {/* Grease */}
            <div className="rounded-2xl bg-white/[0.04] border border-white/[0.06] px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">Grease — All Points</p>
                {maint.grease?.last ? (
                  <p className={`text-[11px] mt-0.5 ${maint.grease.overdue ? 'text-red-400' : maint.grease.warning ? 'text-amber-400' : 'text-white/35'}`}>
                    {maint.grease.overdue
                      ? `${Math.abs(maint.grease.hoursLeft).toFixed(1)}h overdue`
                      : maint.grease.hoursLeft != null
                        ? `${maint.grease.hoursLeft.toFixed(1)}h remaining`
                        : '—'}
                  </p>
                ) : (
                  <p className="text-[11px] text-white/25 mt-0.5">No service logged</p>
                )}
              </div>
              <button
                onClick={() => openFluid('grease')}
                className="text-xs text-white/50 border border-white/10 rounded-full px-3 py-1.5
                           active:bg-white/5 transition-colors select-none flex-shrink-0 ml-3"
              >
                + Log
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Compliance drawer */}
      <ComplianceDrawer
        open={compOpen}
        onClose={() => setCompOpen(false)}
        item={complianceItem}
        hobbsCurrent={hobbs}
        cyclesCurrent={cycles}
        onSaved={maintItems.refresh}
      />

      {/* Fluid / grease log drawer */}
      <MaintenanceDrawer
        open={fluidDrawer}
        onClose={() => setFluidDrawer(false)}
        onSaved={maint.refresh}
        defaultType={fluidType}
      />
    </div>
  )
}
