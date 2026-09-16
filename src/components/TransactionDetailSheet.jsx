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
      <p className="text-white font-medium text-sm">{children}</p>
    </div>
  )
}

export default function TransactionDetailSheet({ entry, open, onClose }) {
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  if (!entry) return null
  const e = entry
  const isIncome = (e.net ?? 0) > 0
  const gross = e.cash ?? e.net

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
            <span className={`text-base font-bold tabular-nums
              ${e.net == null ? 'text-white/25' : isIncome ? 'text-emerald-400' : 'text-white/85'}`}>
              {e.net == null ? 'no price' : `${isIncome ? '+' : '−'}${usd(e.net)}`}
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
