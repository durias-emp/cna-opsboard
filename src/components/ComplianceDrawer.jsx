import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" className="w-4 h-4">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
)

export default function ComplianceDrawer({ open, onClose, item, hobbsCurrent, cyclesCurrent, onSaved }) {
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const [form,    setForm]    = useState({})
  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(false)
  const [errors,  setErrors]  = useState({})

  useEffect(() => {
    if (!open || !item) return
    setSuccess(false)
    setErrors({})
    setSaving(false)
    setForm({
      work_order_number: '',
      complied_date:     todayLocal(),
      complied_hours:    hobbsCurrent ?? '',
      complied_cycles:   cyclesCurrent ?? '',
      notes:             '',
    })
  }, [open, item, hobbsCurrent, cyclesCurrent])

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
    setErrors(e => ({ ...e, [field]: undefined }))
  }

  function validate() {
    const e = {}
    if (!form.work_order_number?.trim()) e.wo = 'Required'
    if (!form.complied_date)             e.date = 'Required'

    const hrs = parseFloat(form.complied_hours)
    if (!form.complied_hours)            e.hours = 'Required'
    else if (isNaN(hrs) || hrs < 0)      e.hours = 'Invalid number'

    if (needsCycles && form.complied_cycles) {
      const cyc = parseInt(form.complied_cycles, 10)
      if (isNaN(cyc) || cyc < 0) e.cycles = 'Invalid number'
    }
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }

    setSaving(true)

    const compliedHours  = parseFloat(form.complied_hours)
    const compliedCycles = form.complied_cycles ? parseInt(form.complied_cycles, 10) : null

    // Atomic: inserts the compliance log AND rolls the item forward in one
    // transaction (log_compliance Postgres function). All-or-nothing.
    const { error: rpcErr } = await supabase.rpc('log_compliance', {
      p_item_id:         item.id,
      p_aircraft_id:     item.aircraft_id,
      p_work_order:      form.work_order_number.trim(),
      p_complied_date:   form.complied_date,
      p_complied_hours:  compliedHours,
      p_complied_cycles: compliedCycles,
      p_notes:           form.notes.trim() || null,
    })

    if (rpcErr) { setSaving(false); setErrors({ _: rpcErr.message }); return }

    setSaving(false)
    setSuccess(true)
    onSaved?.()
    setTimeout(() => { setSuccess(false); onClose() }, 1400)
  }

  if (!item) return null

  const needsCycles = item.limit_type === 'HOURS_AND_CYCLES'

  return (
    <>
      <div
        className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      <div className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`} style={panelStyle}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-1 pb-3 border-b border-white/[0.06] flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-base font-bold text-white truncate">Log Compliance</p>
            <p className="text-[11px] text-white/35 mt-0.5 truncate">{item.description}</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 active:bg-white/10 flex-shrink-0">
            <IconClose />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* Work Order */}
          <div className="card space-y-3">
            <p className="label">Work Order</p>
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">
                Work Order Number
                {errors.wo && <span className="ml-1.5 text-white/50">— {errors.wo}</span>}
              </p>
              <input
                type="text"
                placeholder="e.g. WO-2024-001"
                value={form.work_order_number ?? ''}
                onChange={e => set('work_order_number', e.target.value)}
                className={`input-field w-full ${errors.wo ? 'border-white/30' : ''}`}
              />
            </div>
          </div>

          {/* Compliance data */}
          <div className="card space-y-3">
            <p className="label">Compliance Data</p>

            <div>
              <p className="text-[11px] text-white/40 mb-1.5">
                Date Complied
                {errors.date && <span className="ml-1.5 text-white/50">— {errors.date}</span>}
              </p>
              <input
                type="date"
                value={form.complied_date ?? ''}
                onChange={e => set('complied_date', e.target.value)}
                className={`input-field w-full ${errors.date ? 'border-white/30' : ''}`}
                style={{ colorScheme: 'dark' }}
              />
            </div>

            <div>
              <p className="text-[11px] text-white/40 mb-1.5">
                Air Time at Compliance
                {errors.hours && <span className="ml-1.5 text-white/50">— {errors.hours}</span>}
              </p>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="17563.6"
                  value={form.complied_hours ?? ''}
                  onChange={e => set('complied_hours', e.target.value)}
                  className={`input-field w-full pr-10 ${errors.hours ? 'border-white/30' : ''}`}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/25 pointer-events-none">h</span>
              </div>
            </div>

            {needsCycles && (
              <div>
                <p className="text-[11px] text-white/40 mb-1.5">
                  Cycles at Compliance
                  {errors.cycles && <span className="ml-1.5 text-white/50">— {errors.cycles}</span>}
                </p>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="25900"
                    value={form.complied_cycles ?? ''}
                    onChange={e => set('complied_cycles', e.target.value)}
                    className="input-field w-full pr-16"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/25 pointer-events-none">cyc</span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="card">
            <p className="label mb-3">Notes</p>
            <textarea
              placeholder="Technician remarks, part numbers replaced, next action…"
              value={form.notes ?? ''}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="input-field w-full resize-none"
            />
          </div>

          {errors._ && <p className="text-xs text-white/40 text-center">{errors._}</p>}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-4 pt-3 border-t border-white/[0.05]"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleSave}
            disabled={saving || success}
            className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200 select-none
              ${success
                ? 'bg-white/15 text-white/50'
                : 'bg-white text-black active:scale-[0.98]'}`}
          >
            {success ? '✓ Compliance Logged' : saving ? 'Saving…' : 'Log Compliance'}
          </button>
        </div>
      </div>
    </>
  )
}
