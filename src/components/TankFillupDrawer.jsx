import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { round2 } from '../lib/utils'
import { TANK_MAX_GAL, SUPPLIERS } from '../hooks/useTank'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

// defaultMode: 'fillup' | 'withdrawal'
export default function TankFillupDrawer({ open, onClose, onSaved, lastGallonsAfter, defaultMode = 'fillup' }) {
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const [mode,     setMode]     = useState(defaultMode)
  const [date,     setDate]     = useState('')
  const [before,   setBefore]   = useState('')
  const [amount,   setAmount]   = useState('')   // gallons added (fillup) or taken (withdrawal)
  const [price,    setPrice]    = useState('')   // fillup only
  const [supplier, setSupplier] = useState('comalapa') // fillup only
  const [notes,    setNotes]    = useState('')
  const [saving,   setSaving]   = useState(false)
  const [error,    setError]    = useState(null)

  const isFillup = mode === 'fillup'

  // Derived
  const beforeNum = parseFloat(before)
  const amountNum = parseFloat(amount)
  const priceNum  = parseFloat(price)

  const afterNum  = !isNaN(beforeNum) && !isNaN(amountNum)
    ? round2(isFillup ? beforeNum + amountNum : beforeNum - amountNum)
    : null

  const totalCost = isFillup && !isNaN(amountNum) && !isNaN(priceNum)
    ? round2(amountNum * priceNum)
    : null

  const overFill  = isFillup  && afterNum != null && afterNum > TANK_MAX_GAL
  const overDraw  = !isFillup && afterNum != null && afterNum < 0

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Reset on open
  useEffect(() => {
    if (open) {
      setMode(defaultMode)
      const _d = new Date()
      setDate(`${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`)
      setBefore(lastGallonsAfter != null ? String(lastGallonsAfter) : '')
      setAmount('')
      setPrice('')
      setSupplier('comalapa')
      setNotes('')
      setError(null)
    }
  }, [open, lastGallonsAfter, defaultMode])

  // When switching mode, clear amount + error
  function switchMode(m) {
    setMode(m)
    setAmount('')
    setError(null)
  }

  async function handleSave() {
    if (!date || isNaN(beforeNum) || isNaN(amountNum)) {
      setError('Date and gallons are required.')
      return
    }
    if (amountNum <= 0) { setError('Amount must be greater than 0.'); return }
    if (beforeNum < 0)  { setError('Gallons before can\'t be negative.'); return }
    if (isFillup && isNaN(priceNum)) { setError('Price per gallon is required.'); return }
    if (overFill) { setError(`Would exceed tank max of ${TANK_MAX_GAL} gal.`); return }
    if (overDraw) { setError('Can\'t withdraw more than what\'s in the tank.'); return }

    setError(null)
    setSaving(true)

    // For withdrawals, gallons_added is negative so gallons_after still works
    const gallonsAdded = isFillup ? amountNum : -amountNum

    const payload = {
      type:             mode,
      date,
      gallons_before:   beforeNum,
      gallons_added:    gallonsAdded,
      price_per_gallon: isFillup ? priceNum : 0,
      supplier:         isFillup ? supplier : 'comalapa', // supplier required by DB; ignored for withdrawals
      notes:            notes || null,
    }

    const { error: err } = await supabase.from('tank_fillups').insert(payload)

    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved?.()
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`} style={panelStyle}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isFillup ? 'Log Fill-up' : 'Log Withdrawal'}
            </h2>
            <p className="text-xs text-white/35 mt-0.5">Facility tank · Max {TANK_MAX_GAL} gal</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center
                       text-white/50 active:bg-white/10 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-2 px-5 pb-4 flex-shrink-0">
          {[
            { key: 'fillup',     label: '↑ Fill-up'   },
            { key: 'withdrawal', label: '↓ Withdraw'  },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => switchMode(key)}
              className={`flex-1 rounded-full py-2 text-xs font-semibold border transition-colors select-none
                          ${mode === key
                            ? 'bg-white text-black border-white'
                            : 'bg-transparent text-white/40 border-white/10'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-2">

          {/* Date */}
          <div>
            <label className="label block mb-1.5">Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {/* Gallons before / amount */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">Gallons before</label>
              <div className="relative">
                <input type="text" inputMode="decimal" value={before}
                  onChange={e => setBefore(e.target.value)}
                  placeholder="42.0"
                  className="input-field w-full pr-10" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">gal</span>
              </div>
            </div>
            <div>
              <label className="label block mb-1.5">
                {isFillup ? 'Gallons added' : 'Gallons taken'}
              </label>
              <div className="relative">
                <input type="text" inputMode="decimal" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder={isFillup ? '80.0' : '30.0'}
                  className="input-field w-full pr-10" />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">gal</span>
              </div>
            </div>
          </div>

          {/* Gallons after — auto-calculated */}
          {afterNum !== null && (
            <div className={`flex items-center justify-between px-4 py-3 rounded-2xl border
                            ${overFill || overDraw
                              ? 'bg-red-500/10 border-red-500/20'
                              : 'bg-white/[0.04] border-white/[0.06]'}`}>
              <p className="text-xs text-white/40">Tank after</p>
              <div className="flex items-center gap-2">
                <p className={`text-sm font-bold ${overFill || overDraw ? 'text-red-400' : 'text-white'}`}>
                  {afterNum} <span className="text-xs font-normal text-white/40">/ {TANK_MAX_GAL} gal</span>
                </p>
                <div className="w-16 h-1.5 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${overFill || overDraw ? 'bg-red-400' : 'bg-white/60'}`}
                    style={{ width: `${Math.min(Math.max((afterNum / TANK_MAX_GAL) * 100, 0), 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fill-up only: supplier + price */}
          {isFillup && (
            <>
              {/* Supplier */}
              <div>
                <label className="label block mb-1.5">Supplier</label>
                <div className="flex gap-2">
                  {Object.entries(SUPPLIERS).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSupplier(key)}
                      className={`flex-1 rounded-xl py-2.5 text-xs font-semibold border transition-colors select-none
                                  ${supplier === key
                                    ? 'bg-white text-black border-white'
                                    : 'bg-transparent text-white/40 border-white/10'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price per gallon */}
              <div>
                <label className="label block mb-1.5">Price per gallon</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-white/30">$</span>
                  <input type="text" inputMode="decimal" value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="6.50"
                    className="input-field w-full pl-7 pr-16" />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">USD/gal</span>
                </div>
              </div>

              {/* Total cost */}
              {totalCost !== null && (
                <div className="flex items-center justify-between px-4 py-3 rounded-2xl
                                bg-white/[0.04] border border-white/[0.06]">
                  <p className="text-xs text-white/40">Total cost</p>
                  <p className="text-sm font-bold text-white">
                    ${totalCost.toFixed(2)} <span className="text-xs font-normal text-white/40">USD</span>
                  </p>
                </div>
              )}
            </>
          )}

          {/* Notes */}
          <div>
            <label className="label block mb-1.5">
              Notes <span className="normal-case font-normal text-white/25">(optional)</span>
            </label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Any observations…"
              className="input-field w-full resize-none" />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p className="px-5 pt-2 text-xs text-red-400 flex-shrink-0">{error}</p>
        )}

        {/* Footer */}
        <div
          className="flex-shrink-0 border-t border-white/[0.06] px-5 pt-4 pb-4"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleSave}
            disabled={saving || overFill || overDraw}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm
                       flex items-center justify-center gap-2
                       active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Saving…
              </>
            ) : isFillup ? 'Log Fill-up' : 'Log Withdrawal'}
          </button>
        </div>
      </div>
    </>
  )
}
