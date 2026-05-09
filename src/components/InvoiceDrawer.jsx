import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAircraft } from '../context/AircraftContext'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

// ── Phone formatter ────────────────────────────────────────────────────────────
function formatPhone(input) {
  const digits = input.replace(/\D/g, '')
  if (!digits) return ''

  // El Salvador — country code 503, 8-digit local numbers
  if (digits.startsWith('503')) {
    const local = digits.slice(3, 11)
    if (!local) return '(503) '
    if (local.length <= 4) return `(503) ${local}`
    return `(503) ${local.slice(0, 4)}-${local.slice(4)}`
  }

  // US / Canada — country code 1, 10-digit local numbers
  if (digits.startsWith('1') && digits.length >= 2) {
    const rest = digits.slice(1, 11)
    if (rest.length <= 3) return `+1 (${rest}`
    if (rest.length <= 6) return `+1 (${rest.slice(0, 3)}) ${rest.slice(3)}`
    return `+1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`
  }

  // Other — show raw digits (international)
  return digits.slice(0, 15)
}

const PAYMENT_METHODS = [
  { value: 'cash',     label: 'Cash'     },
  { value: 'card',     label: 'Card'     },
  { value: 'transfer', label: 'Transfer' },
  { value: 'bitcoin',  label: 'Bitcoin'  },
]

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function invoiceNum(n) {
  return `#${String(n).padStart(3, '0')}`
}

// Convert decimal hours → "Xh Ym" or "Y min" label
function hoursToLabel(val) {
  const h = parseFloat(val)
  if (!val || isNaN(h) || h <= 0) return null
  const totalMins = Math.round(h * 60)
  const hrs  = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  if (hrs === 0) return `${mins} min`
  if (mins === 0) return `${hrs}h`
  return `${hrs}h ${mins}min`
}

const EMPTY = {
  firstName:     '',
  lastName:      '',
  email:         '',
  phone:         '',
  date:          today(),
  flightTime:    '',   // decimal hours e.g. "0.5", "1.3"
  amountPaid:    '',
  paymentMethod: 'cash',
  notes:         '',
}

export default function InvoiceDrawer({ open, onClose, onSaved, editInvoice }) {
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const { selectedAircraft } = useAircraft()
  const isEditing = !!editInvoice

  const [form,          setForm]          = useState(EMPTY)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function set(field, value) {
    setForm(f => ({ ...f, [field]: value }))
  }

  // Pre-fill or reset when drawer opens
  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmDelete(false)

    if (isEditing && editInvoice) {
      const mins = editInvoice.flight_time_minutes
      setForm({
        firstName:     editInvoice.customer_first_name ?? '',
        lastName:      editInvoice.customer_last_name  ?? '',
        email:         editInvoice.customer_email       ?? '',
        phone:         editInvoice.customer_phone       ?? '',
        date:          editInvoice.date                 ?? today(),
        flightTime:    mins != null ? String(Math.round(mins / 6) / 10) : '',
        amountPaid:    editInvoice.amount_paid != null ? String(editInvoice.amount_paid) : '',
        paymentMethod: editInvoice.payment_method ?? 'cash',
        notes:         editInvoice.notes ?? '',
      })
    } else {
      setForm({ ...EMPTY, date: today() })
    }
  }, [open])

  function handleClose() {
    setError(null)
    setConfirmDelete(false)
    onClose()
  }

  const canSave =
    form.firstName.trim() &&
    form.lastName.trim()  &&
    form.amountPaid !== '' &&
    !isNaN(Number(form.amountPaid)) &&
    Number(form.amountPaid) >= 0

  async function handleSave() {
    if (!canSave || saving) return
    setSaving(true)
    setError(null)

    try {
      const flightMins = form.flightTime
        ? Math.round(parseFloat(form.flightTime) * 60)
        : null

      const payload = {
        customer_first_name: form.firstName.trim(),
        customer_last_name:  form.lastName.trim(),
        customer_email:      form.email.trim()  || null,
        customer_phone:      form.phone.trim()  || null,
        date:                form.date,
        flight_time_minutes: flightMins,
        amount_paid:         Number(form.amountPaid),
        payment_method:      form.paymentMethod,
        notes:               form.notes.trim() || null,
      }

      if (isEditing) {
        const { error: err } = await supabase
          .from('invoices')
          .update(payload)
          .eq('id', editInvoice.id)
        if (err) { setError(err.message); return }
      } else {
        const { error: err } = await supabase
          .from('invoices')
          .insert({ ...payload, aircraft_id: selectedAircraft?.id ?? null })
        if (err) { setError(err.message); return }
      }

      onSaved?.()
      handleClose()
    } catch (e) {
      setError(e.message ?? 'Unexpected error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!editInvoice || saving) return
    setSaving(true)
    const { error: err } = await supabase.from('invoices').delete().eq('id', editInvoice.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved?.()
    handleClose()
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-black/60 z-[60] transition-opacity duration-300
          ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-[70] bg-navy-900 rounded-t-3xl
          transition-transform duration-300 ease-out
          ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '92dvh', display: 'flex', flexDirection: 'column', ...panelStyle }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-white">
              {isEditing ? 'Edit Invoice' : 'New Invoice'}
            </h2>
            {isEditing && (
              <p className="text-[11px] text-white/35 mt-0.5">
                {invoiceNum(editInvoice.invoice_number)}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {error && (
              <p className="text-xs text-red-400 bg-red-400/10 rounded-xl px-3 py-1.5 max-w-[55%] text-right">
                {error}
              </p>
            )}
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center text-white/50 flex-shrink-0"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 pb-4 space-y-5">

          {/* ── Customer ── */}
          <div>
            <p className="label mb-3">Customer</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 block">First name</label>
                <input type="text" value={form.firstName}
                  onChange={e => set('firstName', e.target.value)}
                  placeholder="Maria" className="input-field w-full" />
              </div>
              <div>
                <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 block">Last name</label>
                <input type="text" value={form.lastName}
                  onChange={e => set('lastName', e.target.value)}
                  placeholder="García" className="input-field w-full" />
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 block">Email</label>
              <input type="email" inputMode="email" value={form.email}
                onChange={e => set('email', e.target.value)}
                placeholder="maria@example.com" className="input-field w-full" />
            </div>
            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 block">Phone</label>
              <input type="tel" inputMode="tel" value={form.phone}
                onChange={e => set('phone', formatPhone(e.target.value))}
                placeholder="0000-0000" className="input-field w-full" />
            </div>
          </div>

          {/* ── Invoice details ── */}
          <div>
            <p className="label mb-3">Invoice details</p>

            <div className="mb-3">
              <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 block">Date</label>
              <DatePicker value={form.date} onChange={v => set('date', v)} />
            </div>

            <div className="mb-3">
              <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 block">Flight time</label>
              <div className="relative">
                <input
                  type="text" inputMode="decimal"
                  value={form.flightTime}
                  onChange={e => set('flightTime', e.target.value)}
                  placeholder="0.0"
                  className="input-field w-full pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none">h</span>
              </div>
              {hoursToLabel(form.flightTime) && (
                <p className="text-[11px] text-white/30 mt-1.5 pl-1">
                  {hoursToLabel(form.flightTime)}
                </p>
              )}
            </div>

            <div className="mb-4">
              <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 block">Amount paid</label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-white/30 pointer-events-none">$</span>
                <input type="number" inputMode="decimal" min="0" step="0.01"
                  value={form.amountPaid} onChange={e => set('amountPaid', e.target.value)}
                  placeholder="0.00" className="input-field w-full pl-7" />
              </div>
            </div>

            <div>
              <label className="text-[10px] text-white/40 uppercase tracking-wide mb-2 block">Payment method</label>
              <div className="grid grid-cols-4 gap-1.5">
                {PAYMENT_METHODS.map(({ value, label }) => (
                  <button key={value} type="button" onClick={() => set('paymentMethod', value)}
                    className={`py-2.5 rounded-xl text-xs font-medium transition-colors
                      ${form.paymentMethod === value ? 'bg-white text-black' : 'bg-white/[0.06] text-white/50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ── Notes ── */}
          <div>
            <label className="text-[10px] text-white/40 uppercase tracking-wide mb-1.5 block">Notes (optional)</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Additional details…" rows={3}
              className="input-field w-full resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 flex-shrink-0 border-t border-white/[0.06] space-y-3">
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className={`w-full py-3.5 rounded-2xl text-sm font-semibold transition-colors
              ${canSave && !saving
                ? 'bg-white text-black active:bg-white/90'
                : 'bg-white/10 text-white/30'}`}
          >
            {saving ? 'Saving…' : isEditing ? 'Update Invoice' : 'Create Invoice'}
          </button>

          {/* Delete — edit mode only */}
          {isEditing && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2.5 text-sm text-red-400/70 font-medium
                         active:text-red-400 transition-colors select-none"
            >
              Delete Invoice
            </button>
          )}

          {isEditing && confirmDelete && (
            <div className="flex items-center gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 rounded-2xl bg-white/[0.07] text-sm text-white/50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 py-2.5 rounded-2xl bg-red-500/80 text-sm text-white font-semibold
                           active:bg-red-500 disabled:opacity-40"
              >
                {saving ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
