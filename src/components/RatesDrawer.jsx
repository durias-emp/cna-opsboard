import { useEffect, useState } from 'react'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

// Finance Phase 2: the cost_rates editor. One row per aircraft, all NET USD.
// Pilot is hourly only for CNA (decision 2); the monthly field is hidden.
const FIELDS = [
  ['fuel_price_gal',   'Fuel price per gallon', 'fallback when no purchases logged'],
  ['pilot_rate_hr',    'Pilot per flight hour', 'CNA: 100.00 net'],
  ['insurance_year',   'Insurance per year',    null],
  ['hangar_year',      'Hangar / base per year', null],
  ['other_fixed_year', 'Other fixed per year',  null],
  ['target_rate_hr',   'Target rate per hour',  'blank uses the quote profile rate'],
]

export default function RatesDrawer({ open, onClose, rates, onSave, targetPlaceholder }) {
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  const [form,   setForm]   = useState({})
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  useEffect(() => {
    if (!open) return
    const f = {}
    for (const [k] of FIELDS) f[k] = rates?.[k] != null ? String(rates[k]) : ''
    setForm(f); setError(null); setSaving(false)
  }, [open, rates])

  async function handleSave() {
    const patch = {}
    for (const [k, label] of FIELDS) {
      const v = form[k]?.trim() ?? ''
      if (v === '') { patch[k] = null; continue }
      const n = parseFloat(v.replace(/[^0-9.]/g, ''))
      if (!Number.isFinite(n) || n < 0) { setError(`${label}: invalid number`); return }
      patch[k] = Math.round(n * 100) / 100
    }
    setSaving(true)
    const err = await onSave(patch)
    setSaving(false)
    if (err) { setError(err); return }
    onClose()
  }

  return (
    <>
      <div className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`} style={panelStyle} {...panelProps}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="px-5 py-3 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">Cost rates</h2>
          <p className="text-xs text-white/35 mt-0.5">All amounts net USD</p>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          {FIELDS.map(([k, label, hint]) => (
            <div key={k}>
              <label className="label block mb-1.5">{label}</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                <input type="text" inputMode="decimal" value={form[k] ?? ''}
                  onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                  placeholder={k === 'target_rate_hr' && targetPlaceholder != null ? String(targetPlaceholder) : '0.00'}
                  className="input-field w-full pl-7" />
              </div>
              {hint && <p className="text-[10px] text-white/25 mt-1">{hint}</p>}
            </div>
          ))}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
        <div className="flex-shrink-0 px-4 pt-3 border-t border-white/[0.05]"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-white text-black text-sm font-bold
                       active:scale-[0.98] transition-transform disabled:opacity-40">
            {saving ? 'Saving…' : 'Save rates'}
          </button>
        </div>
      </div>
    </>
  )
}
