// Finance Phase 1: the shared cost-capture block. Every real cost carries an
// amount, an invoice reference, and the two IVA flags (includes_iva: the
// figure entered is gross; iva_recoverable: the IVA can be credited).
// Rendered only where the caller decided money may show (management gate is
// the caller's job). Pure controlled component: value = { amount, invoice_ref,
// includes_iva, iva_recoverable }, onChange(patch) merges.

function Toggle({ on, label, onTap }) {
  return (
    <button type="button" onClick={onTap}
      className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors select-none
        ${on ? 'bg-accent/20 text-accent' : 'bg-white/[0.06] text-white/40'}`}>
      {label}
    </button>
  )
}

export default function CostFields({ value, onChange, label = 'Cost (optional)' }) {
  const v = value ?? {}
  const set = patch => onChange({ ...v, ...patch })
  return (
    <div className="space-y-3">
      <p className="label">{label}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
          <input
            type="text" inputMode="decimal" placeholder="0.00"
            value={v.amount ?? ''}
            onChange={e => set({ amount: e.target.value })}
            className="input-field w-full pl-7"
          />
        </div>
        <input
          type="text" placeholder="Invoice #"
          value={v.invoice_ref ?? ''}
          onChange={e => set({ invoice_ref: e.target.value })}
          className="input-field w-full"
        />
      </div>
      <div className="flex gap-2">
        <Toggle on={v.includes_iva !== false} label="Includes IVA"
          onTap={() => set({ includes_iva: !(v.includes_iva !== false) })} />
        <Toggle on={v.iva_recoverable !== false} label="IVA recoverable"
          onTap={() => set({ iva_recoverable: !(v.iva_recoverable !== false) })} />
      </div>
    </div>
  )
}

// Parses the amount the way the DB stores it: numeric(14,2) or null.
export function parseCost(v) {
  const n = parseFloat(String(v?.amount ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null
}
