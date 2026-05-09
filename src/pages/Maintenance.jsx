import { useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { useMaintenance, FLUID_TYPES } from '../hooks/useMaintenance'
import PageHeader from '../components/PageHeader'
import SectionHeader from '../components/SectionHeader'
import MaintenanceDrawer from '../components/MaintenanceDrawer'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

// ── Grease Timer Ring ─────────────────────────────────────────────────────────

function GreaseRing({ grease }) {
  const { hoursSince, progress, warning, overdue, hoursLeft, nextDueHobbs } = grease
  const r = 52
  const circ = 2 * Math.PI * r
  // Countdown: full when just greased, drains to empty as interval approaches
  const offset = circ * (progress ?? 0)

  const ringColor = overdue
    ? 'rgba(255,255,255,0.95)'
    : warning
      ? 'rgba(255,255,255,0.7)'
      : 'rgba(255,255,255,0.35)'

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="label">Grease interval</p>
          <p className="text-xs text-white/40 mt-0.5">Every 25 flight hours · All points</p>
        </div>
        {(warning || overdue) && (
          <span className={`badge ${overdue ? 'bg-white text-black' : 'bg-white/10 text-white'}
                           ${warning && !overdue ? 'animate-pulse' : ''}`}>
            {overdue ? 'OVERDUE' : 'Due soon'}
          </span>
        )}
      </div>

      <div className="flex items-center gap-6">
        {/* Ring */}
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            {/* Track */}
            <circle cx="60" cy="60" r={r} fill="none"
              stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
            {/* Progress */}
            <circle cx="60" cy="60" r={r} fill="none"
              stroke={ringColor}
              strokeWidth="10"
              strokeDasharray={circ}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s ease' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-2xl font-bold text-white leading-none">
              {hoursLeft != null
                ? overdue ? Math.abs(hoursLeft).toFixed(1) : hoursLeft.toFixed(1)
                : '—'}
            </p>
            <p className="text-[10px] text-white/35 mt-0.5">
              {overdue ? 'h over' : 'h left'}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="label mb-1">Hours remaining</p>
            <p className="text-xl font-bold text-white">
              {hoursLeft != null
                ? overdue
                  ? `−${Math.abs(hoursLeft).toFixed(1)}h`
                  : `${hoursLeft.toFixed(1)}h`
                : '—'}
            </p>
          </div>
          <div>
            <p className="label mb-1">Next due (Hobbs)</p>
            <p className="text-sm font-semibold text-white">
              {nextDueHobbs != null ? nextDueHobbs.toLocaleString() + ' h' : '—'}
            </p>
          </div>
          {grease.last && (
            <div>
              <p className="label mb-1">Last greased</p>
              <p className="text-xs text-white/60">{formatDate(grease.last.date)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Overdue warning banner */}
      {overdue && (
        <div className="mt-4 bg-white/[0.06] border border-white/20 rounded-2xl px-4 py-3 flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-white flex-shrink-0" />
          <p className="text-xs font-semibold text-white">
            Grease required — overdue by {Math.abs(hoursLeft).toFixed(1)}h. Schedule service immediately.
          </p>
        </div>
      )}

    </div>
  )
}

// ── Fluid Card ────────────────────────────────────────────────────────────────

function FluidCard({ type, status, onAdd }) {
  const { last, history, hoursSince, avgQtsPer10h, trend } = status
  const label = FLUID_TYPES[type].label

  // Sparkline normalisation
  const sparkData = history.slice().reverse()
  const maxQt = Math.max(...sparkData.map(e => e.quantity_quarts), 0.25)

  const trendArrow = trend === 'up' ? '↑' : trend === 'down' ? '↓' : null
  const trendLabel = trend === 'up' ? 'Increasing' : trend === 'down' ? 'Decreasing' : null

  return (
    <div className="card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white">{label}</p>
        <button onClick={onAdd}
          className="text-xs text-white/50 border border-white/10 rounded-full px-3 py-1
                     active:bg-white/5 transition-colors select-none">
          + Add
        </button>
      </div>

      {last ? (
        <>
          {/* 3-stat row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="label mb-1">Last added</p>
              <p className="text-xs font-semibold text-white">{formatDate(last.date)}</p>
              <p className="text-[10px] text-white/35 mt-0.5">{last.hobbs_at_service?.toLocaleString()}h</p>
            </div>
            <div>
              <p className="label mb-1">Since service</p>
              <p className="text-xl font-bold text-white leading-tight">{hoursSince ?? '—'}<span className="text-xs text-white/40 font-normal ml-0.5">h</span></p>
            </div>
            <div>
              <p className="label mb-1">Last amount</p>
              <p className="text-xl font-bold text-white leading-tight">{last.quantity_quarts}<span className="text-xs text-white/40 font-normal ml-0.5">qt</span></p>
            </div>
          </div>

          {/* Trend row */}
          {avgQtsPer10h != null && (
            <div className="flex items-center justify-between py-2 border-t border-white/[0.05]">
              <div>
                <p className="label mb-0.5">Avg per 10h flown</p>
                <p className="text-sm font-semibold text-white">{avgQtsPer10h} qt</p>
              </div>
              {trendArrow && (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm text-white/50">{trendArrow}</span>
                  <span className="text-xs text-white/40">{trendLabel}</span>
                </div>
              )}
            </div>
          )}

          {/* Sparkline — pixel heights avoid Safari flex % resolution bug */}
          {sparkData.length >= 1 && (
            <div>
              <p className="label mb-2">Consumption history</p>
              <div className="flex items-end gap-1" style={{ height: 40 }}>
                {sparkData.map((entry, i) => {
                  const barH = Math.max(Math.round((entry.quantity_quarts / maxQt) * 40), 3)
                  return (
                    <div
                      key={entry.id}
                      style={{ height: barH }}
                      className={`flex-1 rounded-t transition-all
                        ${i === sparkData.length - 1 ? 'bg-white/70' : 'bg-white/20'}`}
                    />
                  )
                })}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-white/20">older</span>
                <span className="text-[9px] text-white/20">latest</span>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="flex items-center gap-3 py-4">
          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/20 flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="w-4 h-4">
              <path strokeLinecap="round" d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          </div>
          <p className="text-xs text-white/30">No service logged yet</p>
        </div>
      )}
    </div>
  )
}

// ── Service History Row ───────────────────────────────────────────────────────

function HistoryRow({ entry, isLast }) {
  const isGrease = entry._kind === 'grease'
  const label = isGrease
    ? 'Grease — All points'
    : FLUID_TYPES[entry.fluid_type]?.label ?? entry.fluid_type

  return (
    <div className={`flex items-center justify-between py-3 ${!isLast ? 'border-b border-white/[0.05]' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
          {isGrease ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
              strokeLinecap="round" className="w-4 h-4 text-white/40">
              <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M2 12h3M19 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
              strokeLinecap="round" className="w-4 h-4 text-white/40">
              <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
            </svg>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-white">{label}</p>
          <p className="text-[10px] text-white/35 mt-0.5">
            {formatDate(entry.date)} · {entry.hobbs_at_service?.toLocaleString()}h
          </p>
        </div>
      </div>
      <div className="text-right">
        {!isGrease && (
          <p className="text-xs font-semibold text-white">{entry.quantity_quarts} qt</p>
        )}
        {entry.notes && (
          <p className="text-[10px] text-white/30 mt-0.5 max-w-[80px] truncate">{entry.notes}</p>
        )}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Maintenance() {
  const { selectedAircraft } = useAircraft()
  const maint = useMaintenance(selectedAircraft?.id, selectedAircraft?.hobbs_current)
  const [drawerOpen, setDrawerOpen]     = useState(false)
  const [drawerType, setDrawerType]     = useState('engine_oil')

  function openDrawer(type = 'engine_oil') {
    setDrawerType(type)
    setDrawerOpen(true)
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <PageHeader
        title="Fluids"
        sub={selectedAircraft?.tail_number}
        action={{ label: 'Log Service', onClick: () => openDrawer('engine_oil') }}
      />

      <div className="px-4 pb-6 space-y-4">

        {/* Grease Timer */}
        {maint.loading
          ? <div className="card animate-pulse h-48" />
          : <GreaseRing grease={maint.grease} />
        }
        <div className="flex justify-end -mt-2">
          <button onClick={() => openDrawer('grease')}
            className="text-xs text-white/40 border border-white/10 rounded-full px-3 py-1
                       active:bg-white/5 transition-colors select-none">
            + Log Grease Session
          </button>
        </div>

        {/* Fluids */}
        <div>
          <SectionHeader title="Fluids" />
          <div className="space-y-3">
            {maint.loading
              ? [1,2,3].map(i => <div key={i} className="card animate-pulse h-24" />)
              : Object.keys(FLUID_TYPES).map(type => (
              <FluidCard
                key={type}
                type={type}
                status={maint.getFluidStatus(type)}
                onAdd={() => openDrawer(type)}
              />
            ))}
          </div>
        </div>

        {/* Service history */}
        <div>
          <SectionHeader title="Service history" />
          {maint.loading ? (
            <div className="card animate-pulse h-20" />
          ) : maint.allHistory.length === 0 ? (
            <div className="card flex flex-col items-center py-10 gap-2">
              <p className="text-xs text-white/30">No service records yet</p>
            </div>
          ) : (
            <div className="card p-0 overflow-hidden px-4">
              {maint.allHistory.map((entry, i) => (
                <HistoryRow
                  key={entry.id}
                  entry={entry}
                  isLast={i === maint.allHistory.length - 1}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <MaintenanceDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onSaved={maint.refresh}
        defaultType={drawerType}
      />
    </div>
  )
}
