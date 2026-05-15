import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

const FREQUENT_PAX = [
  { name: 'Francisco Cordova', weight: 150 },
  { name: 'Westley Cordova',   weight: 180 },
]

const AIRCRAFT_TYPE = 'Bell 206B3 JetRanger'
const REGISTRATION  = 'C-GOPF'

function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY = () => ({
  pilot_in_command:   '',
  date:               todayLocal(),
  daily_inspection:   false,
  weight_and_balance: false,
  route:              '',
  notes:              '',
  departure_time:     '',
  ete:                '',
  fuel_on_board:      '',
  pax: [
    { name: '', weight: '' },
    { name: '', weight: '' },
    { name: '', weight: '' },
    { name: '', weight: '' },
  ],
})

// ── Toggle switch ──────────────────────────────────────────────────────────────
function Toggle({ label, sub, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex-1 min-w-0 pr-4">
        <p className="text-sm font-medium text-white">{label}</p>
        {sub && <p className="text-[10px] text-white/30 mt-0.5">{sub}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-200 select-none
          ${checked ? 'bg-white' : 'bg-white/[0.10]'}`}
      >
        <span className={`inline-block h-5 w-5 rounded-full shadow transform transition-transform duration-200 mt-0.5
          ${checked ? 'translate-x-5 bg-black' : 'translate-x-0.5 bg-white/40'}`}
        />
      </button>
    </div>
  )
}

// ── Close icon ─────────────────────────────────────────────────────────────────
const IconClose = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" className="w-4 h-4">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)

// ── Main drawer ────────────────────────────────────────────────────────────────
export default function ItineraryDrawer({ open, onClose, onSaved, editRecord = null }) {
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const [form,          setForm]         = useState(EMPTY())
  const [saving,        setSaving]       = useState(false)
  const [success,       setSuccess]      = useState(false)
  const [errors,        setErrors]       = useState({})
  const [paxDropdown,   setPaxDropdown]  = useState(null) // index of open dropdown
  const dropdownRef = useRef(null)

  const pilots = [
    { id: 1, name: 'James McBride' },
    { id: 2, name: 'Jay McMackin' },
    { id: 3, name: 'Daniel Sandoval' },
  ]

  // Reset / pre-fill form whenever drawer opens
  useEffect(() => {
    if (!open) return
    if (editRecord) {
      const srcPax = editRecord.pax ?? []
      const filled = srcPax.map(p => ({ name: p.name ?? '', weight: p.weight != null ? String(p.weight) : '' }))
      while (filled.length < 4) filled.push({ name: '', weight: '' })
      setForm({
        pilot_in_command:   editRecord.pilot_in_command   ?? '',
        date:               editRecord.date               ?? todayLocal(),
        daily_inspection:   editRecord.daily_inspection   ?? false,
        weight_and_balance: editRecord.weight_and_balance ?? false,
        route:              editRecord.departure_icao     ?? '',
        notes:              editRecord.additional_comments ?? '',
        departure_time:     editRecord.departure_time     ?? '',
        ete:                editRecord.ete                ?? '',
        fuel_on_board:      editRecord.fuel_on_board != null ? String(editRecord.fuel_on_board) : '',
        pax:                filled.slice(0, 4),
      })
    } else {
      setForm(EMPTY())
    }
    setErrors({})
    setSuccess(false)
    setSaving(false)
    setPaxDropdown(null)
  }, [open, editRecord])

  // Close dropdown on outside click
  useEffect(() => {
    if (paxDropdown === null) return
    function handleOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setPaxDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [paxDropdown])

  function set(field, val) {
    setForm(f => ({ ...f, [field]: val }))
    setErrors(e => ({ ...e, [field]: undefined, _: undefined }))
  }

  function setPax(i, field, val) {
    setForm(f => {
      const pax = [...f.pax]
      pax[i] = { ...pax[i], [field]: val }
      return { ...f, pax }
    })
  }

  function validate() {
    const e = {}
    if (!form.pilot_in_command) e.pilot = 'Required'
    if (!form.route.trim())     e.route = 'Required'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }

    setSaving(true)
    const payload = {
      aircraft_type:       AIRCRAFT_TYPE,
      registration:        REGISTRATION,
      pilot_in_command:    form.pilot_in_command,
      date:                form.date,
      daily_inspection:    form.daily_inspection,
      weight_and_balance:  form.weight_and_balance,
      departure_icao:      form.route.trim(),       // reuse column for route text
      destination_icao:    null,
      departure_time:      form.departure_time || null,
      ete:                 form.ete            || null,
      fuel_on_board:       form.fuel_on_board  ? parseFloat(form.fuel_on_board) : null,
      pax:                 form.pax.filter(p => p.name.trim()),
      additional_comments: form.notes.trim()   || null,
    }

    const { error } = editRecord
      ? await supabase.from('flight_itineraries').update(payload).eq('id', editRecord.id)
      : await supabase.from('flight_itineraries').insert([payload])
    setSaving(false)

    if (error) { setErrors({ _: error.message }); return }

    // Email notification on new submit only — fire and forget
    if (!editRecord) {
      fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'itinerary', data: payload }),
      }).catch(() => {})
    }

    setSuccess(true)
    onSaved?.()
    setTimeout(() => { setSuccess(false); onClose() }, 1400)
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`} style={panelStyle}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-1 pb-3 border-b border-white/[0.06] flex-shrink-0">
          <div>
            <p className="text-base font-bold text-white">{editRecord ? 'Edit Itinerary' : 'Flight Itinerary'}</p>
            <p className="text-[11px] text-white/35 mt-0.5">{REGISTRATION} · {AIRCRAFT_TYPE}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 active:bg-white/10"
          >
            <IconClose />
          </button>
        </div>

        {/* Scrollable form body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

          {/* ── Crew & Date ── */}
          <div className="card space-y-3">
            <p className="label">Crew & Date</p>

            {/* Pilot dropdown */}
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">
                Pilot in Command
                {errors.pilot && <span className="ml-1.5 text-white/50">— {errors.pilot}</span>}
              </p>
              <div className="relative">
                <select
                  value={form.pilot_in_command}
                  onChange={e => set('pilot_in_command', e.target.value)}
                  className={`input-field w-full pr-10 ${!form.pilot_in_command ? 'text-white/25' : 'text-white'}
                    ${errors.pilot ? 'border-white/30' : ''}`}
                  style={{ WebkitAppearance: 'none', appearance: 'none', background: 'rgba(255,255,255,0.06)' }}
                >
                  <option value="" disabled style={{ background: '#111827' }}>Select pilot…</option>
                  {pilots.map(p => (
                    <option key={p.id} value={p.name} style={{ background: '#111827', color: 'white' }}>
                      {p.name}
                    </option>
                  ))}
                  {pilots.length === 0 && (
                    <option disabled style={{ background: '#111827', color: 'rgba(255,255,255,0.3)' }}>
                      No pilots — add via Supabase
                    </option>
                  )}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    strokeLinecap="round" className="w-4 h-4">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Date */}
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Date</p>
              <DatePicker value={form.date} onChange={v => set('date', v)} className="w-full" />
            </div>
          </div>

          {/* ── Pre-flight checks ── */}
          <div className="card">
            <p className="label mb-1">Pre-flight Checks</p>
            <div className="divide-y divide-white/[0.05]">
              <Toggle
                label="Daily Inspection"
                sub="Pre-flight aircraft check completed"
                checked={form.daily_inspection}
                onChange={v => set('daily_inspection', v)}
              />
              <Toggle
                label="Weight & Balance"
                sub="W&B calculation verified"
                checked={form.weight_and_balance}
                onChange={v => set('weight_and_balance', v)}
              />
            </div>
          </div>

          {/* ── Route ── */}
          <div className="card space-y-3">
            <p className="label">Route</p>

            {/* Route free text */}
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">
                Route
                {errors.route && <span className="ml-1.5 text-white/50">— {errors.route}</span>}
              </p>
              <input
                type="text"
                inputMode="text"
                placeholder="e.g. San Salvador → Comalapa → La Unión"
                value={form.route}
                onChange={e => set('route', e.target.value)}
                className={`input-field w-full ${errors.route ? 'border-white/30' : ''}`}
              />
            </div>

            {/* Notes */}
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Notes</p>
              <textarea
                placeholder="Special instructions, hazards, waypoints…"
                value={form.notes}
                onChange={e => set('notes', e.target.value)}
                rows={3}
                className="input-field w-full resize-none"
              />
            </div>

            {/* Departure time & ETE */}
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-[11px] text-white/40 mb-1.5">Departure Time</p>
                <input
                  type="time"
                  value={form.departure_time}
                  onChange={e => set('departure_time', e.target.value)}
                  className="input-field w-full"
                />
              </div>
              <div className="flex-1">
                <p className="text-[11px] text-white/40 mb-1.5">ETE</p>
                <input
                  type="text"
                  inputMode="text"
                  placeholder="e.g. 1:30"
                  value={form.ete}
                  onChange={e => set('ete', e.target.value)}
                  className="input-field w-full"
                />
              </div>
            </div>
          </div>

          {/* ── Fuel ── */}
          <div className="card">
            <p className="label mb-3">Fuel</p>
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">Fuel on Board at Departure</p>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={form.fuel_on_board}
                  onChange={e => set('fuel_on_board', e.target.value)}
                  className="input-field w-full pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/25 pointer-events-none">
                  US gal
                </span>
              </div>
            </div>
          </div>

          {/* ── Passengers ── */}
          <div className="card">
            <p className="label mb-3">Passengers</p>
            <div className="space-y-2.5" ref={dropdownRef}>
              {form.pax.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-white/30">{i + 1}</span>
                  </div>
                  <div className="flex-1 min-w-0 relative">
                    <input
                      type="text"
                      placeholder={`PAX ${i + 1} name`}
                      value={p.name}
                      onChange={e => setPax(i, 'name', e.target.value)}
                      className="input-field w-full py-2.5 pr-8"
                    />
                    {/* Frequent passengers trigger / clear */}
                    <button
                      type="button"
                      onMouseDown={e => {
                        e.preventDefault()
                        if (p.name) {
                          setPax(i, 'name', '')
                          setPax(i, 'weight', '')
                          setPaxDropdown(null)
                        } else {
                          setPaxDropdown(paxDropdown === i ? null : i)
                        }
                      }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                      style={{ transition: 'color 0.2s' }}
                    >
                      <span
                        style={{
                          display: 'inline-block',
                          transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s',
                          transform: p.name ? 'rotate(90deg) scale(1.15)' : 'rotate(0deg) scale(1)',
                        }}
                      >
                        {p.name ? (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                            strokeLinecap="round" className="w-3.5 h-3.5">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                            strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                          </svg>
                        )}
                      </span>
                    </button>
                    {/* Dropdown */}
                    {paxDropdown === i && (
                      <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden border border-white/[0.08] bg-[#1c1c1e] shadow-xl">
                        {FREQUENT_PAX.map(fp => (
                          <button
                            key={fp.name}
                            type="button"
                            onMouseDown={e => {
                              e.preventDefault()
                              setPax(i, 'name', fp.name)
                              setPax(i, 'weight', fp.weight)
                              setPaxDropdown(null)
                            }}
                            className="w-full px-3.5 py-2.5 text-left text-sm text-white/80 hover:bg-white/[0.07] transition-colors flex items-center justify-between"
                          >
                            <span>{fp.name}</span>
                            <span className="text-xs text-white/30">{fp.weight} lbs</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="w-[88px] relative flex-shrink-0">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0"
                      value={p.weight}
                      onChange={e => setPax(i, 'weight', e.target.value)}
                      className="input-field w-full py-2.5 pr-8 text-right"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-white/25 pointer-events-none">
                      lbs
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {errors._ && (
            <p className="text-xs text-white/40 text-center px-4">{errors._}</p>
          )}
        </div>

        {/* Footer CTA */}
        <div className="flex-shrink-0 px-4 pt-3 border-t border-white/[0.06]"
          style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleSave}
            disabled={saving || success}
            className={`w-full py-3.5 rounded-2xl font-semibold text-sm transition-all duration-200 select-none
              ${success
                ? 'bg-white/15 text-white/50'
                : 'bg-white text-black active:scale-[0.98]'}`}
          >
            {success
              ? (editRecord ? '✓ Changes Saved' : '✓ Itinerary Submitted')
              : saving
                ? (editRecord ? 'Saving…' : 'Submitting…')
                : (editRecord ? 'Save Changes' : 'Submit Itinerary')}
          </button>
        </div>
      </div>
    </>
  )
}
