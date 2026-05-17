import { useEffect } from 'react'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

const toHobbs = mins => Math.floor(mins / 6) / 10

function formatDate(dateStr) {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatHobbs(h) {
  return h.toFixed(1)
}

/**
 * Reconstructs the running Hobbs ledger from the flight list.
 * flights must be ordered newest→oldest (as returned by useFlights).
 * currentHobbs is the aircraft's live hobbs_current value.
 *
 * Returns an array ordered oldest→newest, each entry:
 *   { date, pilot, hobbsBefore, added, hobbsAfter }
 */
function buildLedger(flights, currentHobbs) {
  if (!flights?.length || currentHobbs == null) return []

  // Walk newest→oldest, rolling back the Hobbs
  let running = currentHobbs
  const rows = []

  for (const f of flights) {
    const added = toHobbs(f.total_minutes || 0)
    const hobbsAfter  = parseFloat(running.toFixed(1))
    const hobbsBefore = parseFloat((running - added).toFixed(1))

    rows.push({
      id:          f.id,
      date:        f.date,
      pilot:       f.pilot,
      hobbsBefore,
      added,
      hobbsAfter,
    })

    running = hobbsBefore
  }

  // Keep newest→oldest (flights array is already newest first)
  return rows
}

export default function HobbsHistoryDrawer({ open, onClose, flights, currentHobbs, tailNumber }) {
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  const ledger = buildLedger(flights, currentHobbs)

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={panelStyle}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">Hobbs History</h2>
            <p className="text-xs text-white/35 mt-0.5">
              {tailNumber} · Current {currentHobbs?.toLocaleString()}h
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="border-t border-white/[0.06] flex-shrink-0" />

        {/* Ledger */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4 space-y-2"
          style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom))' }}
        >
          {ledger.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-10">No flights logged yet.</p>
          ) : (
            ledger.map((row, i) => (
              <div
                key={row.id ?? i}
                className="flex items-center justify-between bg-white/[0.04] rounded-xl px-4 py-3"
              >
                {/* Left — date + pilot */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white leading-tight">
                    {formatDate(row.date)}
                  </p>
                  {row.pilot && (
                    <p className="text-[11px] text-white/35 mt-0.5 truncate">{row.pilot}</p>
                  )}
                </div>

                {/* Right — hobbs flow */}
                <div className="flex items-center gap-2 text-sm font-mono shrink-0">
                  {/* Before */}
                  <span className="text-white/35 text-xs tabular-nums">
                    {formatHobbs(row.hobbsBefore)}
                  </span>

                  {/* Arrow + delta */}
                  <div className="flex items-center gap-1">
                    <svg viewBox="0 0 16 8" className="w-4 h-2 text-white/20" fill="none">
                      <path d="M0 4h13M10 1l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="text-accent text-[11px] font-semibold tabular-nums">
                      +{formatHobbs(row.added)}
                    </span>
                    <svg viewBox="0 0 16 8" className="w-4 h-2 text-white/20" fill="none">
                      <path d="M0 4h13M10 1l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>

                  {/* After */}
                  <span className="text-white font-bold tabular-nums text-sm">
                    {formatHobbs(row.hobbsAfter)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
