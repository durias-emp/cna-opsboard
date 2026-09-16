import { useState } from 'react'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { formatDate } from '../lib/utils'

// Read-only detail sheet for a ledger entry (Finance). Mirrors the flight
// detail sheet's shape: swipe-down drawer, header with the headline figure,
// labelled rows below. Works for real transactions and derived entries
// (flights, fuel, maintenance actuals) alike.
const usd = n => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Row({ label, children }) {
  if (children == null || children === '') return null
  return (
    <div>
      <p className="text-white/35 mb-0.5 text-xs">{label}</p>
      <p className="text-white font-medium text-sm font-mono tabular-nums">{children}</p>
    </div>
  )
}

export default function TransactionDetailSheet({ entry, open, onClose, flights = [], onLinkFlight }) {
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  if (!entry) return null
  const e = entry
  const gross = e.cash ?? e.net
  const amount = gross
  const isIncome = (amount ?? 0) > 0
  const dayGap = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000)
  const nearbyFlights = flights
    .filter(f => f.date && e.date && dayGap(f.date, e.date) <= 31)
    .sort((a, b) => dayGap(a.date, e.date) - dayGap(b.date, e.date))
    .slice(0, 12)

  return (
    <>
      <div className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`} style={panelStyle} {...panelProps}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">{e.label}</h2>
            <p className="text-[11px] text-white/35 mt-0.5">{formatDate(e.date)}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-base font-bold font-mono tabular-nums
              ${amount == null ? 'text-white/25'
                : amount === 0 ? 'text-white/40'
                : isIncome ? 'text-emerald-400' : 'text-red-400'}`}>
              {amount == null ? 'no price'
                : amount === 0 ? usd(0)
                : `${isIncome ? '+' : '−'}${usd(amount)}`}
            </span>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center text-white/50">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 pb-8 space-y-5">
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-white/[0.08] text-white/60">
              {e.chip ?? e.kind}
            </span>
            {e.pending && (
              <span className="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-amber-400/15 text-amber-300">
                pending
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3">
            {e.net != null && <Row label={isIncome ? 'Amount (net)' : 'Cost (net)'}>{usd(e.net)}</Row>}
            {e.iva != null && e.iva !== 0 && <Row label="IVA (13/113)">{usd(e.iva)}</Row>}
            {gross != null && e.iva != null && e.iva !== 0 && (
              <Row label={isIncome ? 'Received (gross)' : 'Paid (gross)'}>{usd(gross)}</Row>
            )}
            {e.hours != null && e.hours > 0 && <Row label="Air time">{e.hours.toFixed(1)} h</Row>}
            {e.invoice && <Row label="Invoice">#{e.invoice}</Row>}
          </div>

          {e.detail && (
            <div className="bg-white/[0.04] rounded-2xl p-4">
              <p className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap">{e.detail}</p>
            </div>
          )}

          {/* Which flight did this pay for? A flight can have several
              payments: a deposit, the balance, a second party on the same
              trip. Linking is what turns cash into a flight's revenue. */}
          {e.txId && onLinkFlight && (
            <div>
              <p className="label mb-2">Flight</p>
              {e.flightId && !picking ? (
                (() => {
                  const f = flights.find(x => x.id === e.flightId)
                  return (
                    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/[0.04]">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {f ? `${f.pilot ?? 'Flight'} \u00b7 ${((f.total_minutes ?? 0) / 60).toFixed(1)} h` : 'Linked flight'}
                        </p>
                        <p className="text-[11px] text-white/35 mt-0.5">{f ? formatDate(f.date) : ''}</p>
                      </div>
                      <button onClick={() => setPicking(true)}
                        className="text-[12px] font-semibold text-accent active:opacity-70 flex-shrink-0">
                        Change
                      </button>
                    </div>
                  )
                })()
              ) : picking ? (
                <div className="space-y-2">
                  <div className="card !p-0 divide-y divide-white/[0.05] max-h-64 overflow-y-auto">
                    {nearbyFlights.length === 0 && (
                      <p className="text-xs text-white/30 px-4 py-4">No flights within a month of this date.</p>
                    )}
                    {nearbyFlights.map(f => (
                      <button key={f.id} disabled={busy}
                        onClick={async () => {
                          setBusy(true); await onLinkFlight(e.txId, f.id); setBusy(false); setPicking(false)
                        }}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left active:bg-white/[0.06]">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{f.pilot ?? 'Flight'}</p>
                          <p className="text-[11px] text-white/35 mt-0.5">{formatDate(f.date)}</p>
                        </div>
                        <p className="text-[12px] font-mono tabular-nums text-white/50 flex-shrink-0">
                          {((f.total_minutes ?? 0) / 60).toFixed(1)} h
                        </p>
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setPicking(false)}
                      className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-xs font-semibold active:bg-white/5">
                      Cancel
                    </button>
                    {e.flightId && (
                      <button disabled={busy}
                        onClick={async () => { setBusy(true); await onLinkFlight(e.txId, null); setBusy(false); setPicking(false) }}
                        className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/60 text-xs font-semibold active:bg-white/5">
                        Unlink
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button onClick={() => setPicking(true)}
                  className="w-full py-3 rounded-2xl bg-white/[0.07] text-sm font-semibold text-white/80 active:bg-white/[0.12]">
                  Link to a flight
                </button>
              )}
            </div>
          )}

          <p className="text-[10px] text-white/20 leading-relaxed">
            {String(e.id).startsWith('x-')
              ? 'Ledger transaction (imported or entered in Finance).'
              : 'Derived from an operational record (flight, fuel or maintenance); edit it at its source.'}
          </p>
        </div>
      </div>
    </>
  )
}
