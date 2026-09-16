import { useEffect, useState } from 'react'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { formatDate } from '../lib/utils'

// Block hour account: the client's balance, its recharges, and the flights
// that drew from it. Recharging is right here, like topping up a card.
const usd = n => '$' + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const todayLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function BlockDrawer({ block, open, onClose, onRecharge }) {
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!open) return
    setAdding(false); setError(null); setSaving(false)
    setForm({ date: todayLocal(), hours: '', rate: block?.currentRate ? String(block.currentRate) : '', iva: '' })
  }, [open, block])

  if (!block) return null

  async function save() {
    const hours = parseFloat(String(form.hours).replace(/[^0-9.]/g, ''))
    const rate  = parseFloat(String(form.rate).replace(/[^0-9.]/g, ''))
    const iva   = form.iva ? parseFloat(String(form.iva).replace(/[^0-9.]/g, '')) : 0
    if (!(hours > 0))  { setError('Hours must be a positive number'); return }
    if (!(rate > 0))   { setError('Rate must be a positive number'); return }
    setSaving(true)
    const err = await onRecharge({
      blockId: block.id, client: block.client, date: form.date,
      hours: Math.round(hours * 100) / 100, rateHr: Math.round(rate * 100) / 100,
      ivaAmount: Math.round((iva || 0) * 100) / 100,
    })
    setSaving(false)
    if (err) { setError(err); return }
    setAdding(false)
  }

  const low = block.remainingHours <= 1 && !block.overdrawn

  return (
    <>
      <div className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
      <div className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`} style={panelStyle} {...panelProps}>
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">{block.client}</h2>
            <p className="text-[11px] text-white/35 mt-0.5">Block hour account</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center text-white/50 flex-shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-8 space-y-4">
          {/* Balance */}
          <div className="card !p-5 text-center">
            <p className="text-[11px] font-semibold text-white/35 uppercase tracking-[0.18em]">Hours remaining</p>
            <p className={`text-4xl font-bold font-mono tabular-nums mt-2
              ${block.overdrawn ? 'text-red-400' : low ? 'text-amber-300' : 'text-white'}`}>
              {block.remainingHours.toFixed(1)}
              <span className="text-base font-normal text-white/30"> h</span>
            </p>
            <p className="text-[12px] text-white/40 mt-1">
              {block.boughtHours.toFixed(1)} h bought · {block.flownHours.toFixed(1)} h flown
            </p>
            {block.owedValue > 0 && (
              <p className="text-[12px] text-white/50 mt-3">
                Flying owed: <span className="font-mono tabular-nums text-white/80">{usd(block.owedValue)}</span>
              </p>
            )}
            {block.overdrawn && (
              <p className="text-[12px] text-red-400 mt-3">
                Overdrawn. Bill {Math.abs(block.remainingHours).toFixed(1)} h or recharge.
              </p>
            )}
          </div>

          {/* Recharge */}
          {adding ? (
            <div className="card space-y-3">
              <p className="label">Recharge</p>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="label block mb-1.5">Date</label>
                  <input type="date" value={form.date ?? ''}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    className="input-field w-full" />
                </div>
                <div>
                  <label className="label block mb-1.5">Hours</label>
                  <input type="text" inputMode="decimal" value={form.hours ?? ''}
                    onChange={e => setForm(f => ({ ...f, hours: e.target.value }))}
                    placeholder="10" className="input-field w-full" />
                </div>
                <div>
                  <label className="label block mb-1.5">Rate per hour (net)</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                    <input type="text" inputMode="decimal" value={form.rate ?? ''}
                      onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                      placeholder="1060.00" className="input-field w-full pl-7" />
                  </div>
                </div>
                <div>
                  <label className="label block mb-1.5">
                    IVA <span className="normal-case font-normal text-white/25">(blank if none)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
                    <input type="text" inputMode="decimal" value={form.iva ?? ''}
                      onChange={e => setForm(f => ({ ...f, iva: e.target.value }))}
                      placeholder="0.00" className="input-field w-full pl-7" />
                  </div>
                </div>
              </div>
              {form.hours && form.rate && (
                <p className="text-[11px] text-white/40">
                  Charges <span className="font-mono text-white/70">
                    {usd((parseFloat(form.hours) || 0) * (parseFloat(form.rate) || 0) + (parseFloat(form.iva) || 0))}
                  </span> and adds a payment to the ledger.
                </p>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="grid grid-cols-2 gap-2.5">
                <button onClick={() => setAdding(false)}
                  className="py-3 rounded-2xl border border-white/10 text-white/60 text-sm font-semibold active:bg-white/5">
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  className="py-3 rounded-2xl bg-white text-black text-sm font-bold active:scale-[0.98] disabled:opacity-40">
                  {saving ? 'Saving…' : 'Recharge'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setAdding(true)}
              className="w-full py-3 rounded-2xl bg-white/[0.07] text-sm font-semibold text-white/80 active:bg-white/[0.12]">
              + Recharge hours
            </button>
          )}

          {/* Recharge history */}
          {block.recharges.length > 0 && (
            <div>
              <p className="label mb-2">Recharges</p>
              <div className="card !p-0 divide-y divide-white/[0.05]">
                {[...block.recharges].reverse().map(r => (
                  <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">
                        {Number(r.hours).toFixed(1)} h
                        <span className="text-white/35 font-normal"> at {usd(r.rate_hr)}/h</span>
                      </p>
                      <p className="text-[11px] text-white/35 mt-0.5">{formatDate(r.date)}</p>
                    </div>
                    <p className="text-sm font-bold font-mono tabular-nums text-emerald-400 flex-shrink-0">
                      {usd(Number(r.amount_net) + Number(r.iva_amount ?? 0))}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Flights drawn */}
          {block.flights.length > 0 && (
            <div>
              <p className="label mb-2">Flights drawn</p>
              <div className="card !p-0 divide-y divide-white/[0.05]">
                {block.flights.map(f => (
                  <div key={f.id} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{f.pilot ?? 'Flight'}</p>
                      <p className="text-[11px] text-white/35 mt-0.5">{formatDate(f.date)}</p>
                    </div>
                    <p className="text-sm font-bold font-mono tabular-nums text-white/70 flex-shrink-0">
                      −{Number(f.hours).toFixed(1)} h
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {Number(block.opening_hours_used) > 0 && (
            <p className="text-[10px] text-white/20 leading-relaxed">
              {Number(block.opening_hours_used).toFixed(1)} h were flown before the app tracked this block.
            </p>
          )}
        </div>
      </div>
    </>
  )
}
