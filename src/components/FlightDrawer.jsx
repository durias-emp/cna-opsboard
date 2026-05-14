import { useEffect, useRef, useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { supabase } from '../lib/supabase'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

const ROUND = (n, decimals = 2) => Math.round(n * 10 ** decimals) / 10 ** decimals

// Hobbs meters tick every 6 minutes → floor to nearest 0.1
const toHobbs = (minutes) => Math.floor(minutes / 6) / 10

const PILOTS = ['James McBride', 'Jay McMackin']

const emptyLeg = () => ({
  takeoff_time:     '',
  takeoff_location: '',
  landing_time:     '',
  landing_location: '',
})

const emptyPassenger = () => ({ name: '', weight: '' })

const FREQUENT_PAX = [
  { name: 'Francisco Cordova', weight: 150 },
  { name: 'Westley Cordova',   weight: 180 },
]

function toMinutes(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function calcLegMinutes(leg) {
  if (!leg.takeoff_time || !leg.landing_time) return 0
  const diff = toMinutes(leg.landing_time) - toMinutes(leg.takeoff_time)
  return diff > 0 ? diff : 0 // return 0 on invalid — error shown in UI
}

function legTimeError(leg) {
  if (!leg.takeoff_time || !leg.landing_time) return false
  return toMinutes(leg.landing_time) <= toMinutes(leg.takeoff_time)
}

function formatDuration(mins) {
  if (!mins) return null
  return `${toHobbs(mins).toFixed(1)}h`
}

// ── Passenger row ──────────────────────────────────────────────────────────────

function PassengerRow({ passenger, onChange, onRemove, showRemove, dropdownOpen, onToggleDropdown, onSelectFrequent }) {
  return (
    <div className="flex items-center gap-2">
      {/* Name field with frequent-pax trigger */}
      <div className="flex-1 min-w-0 relative">
        <input
          type="text"
          placeholder="Full name"
          value={passenger.name}
          onChange={e => onChange('name', e.target.value)}
          className="input-field w-full pr-8"
        />
        <button
          type="button"
          onMouseDown={e => {
            e.preventDefault()
            if (passenger.name) {
              onChange('name', '')
              onChange('weight', '')
            } else {
              onToggleDropdown()
            }
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
        >
          <span style={{
            display: 'inline-block',
            transition: 'transform 0.25s cubic-bezier(0.34,1.56,0.64,1)',
            transform: passenger.name ? 'rotate(90deg) scale(1.15)' : 'rotate(0deg) scale(1)',
          }}>
            {passenger.name ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                strokeLinecap="round" className="w-3.5 h-3.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
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
        {/* Frequent passengers dropdown */}
        {dropdownOpen && (
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden border border-white/[0.08] bg-[#1c1c1e] shadow-xl">
            {FREQUENT_PAX.map(fp => (
              <button
                key={fp.name}
                type="button"
                onMouseDown={e => { e.preventDefault(); onSelectFrequent(fp) }}
                className="w-full px-3.5 py-2.5 text-left text-sm text-white/80 hover:bg-white/[0.07] transition-colors flex items-center justify-between"
              >
                <span>{fp.name}</span>
                <span className="text-xs text-white/30">{fp.weight} lbs</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Weight */}
      <div className="relative w-20 flex-shrink-0">
        <input
          type="number"
          inputMode="decimal"
          min="0"
          placeholder="0"
          value={passenger.weight}
          onChange={e => onChange('weight', e.target.value)}
          className="input-field w-full pr-6"
        />
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/30 pointer-events-none">lb</span>
      </div>

      {showRemove ? (
        <button onClick={onRemove}
          className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center
                     text-white/30 active:text-white/60 transition-colors flex-shrink-0">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
            strokeLinecap="round" className="w-3 h-3">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      ) : (
        <div className="w-7 flex-shrink-0" />
      )}
    </div>
  )
}

// ── Fuel section card ──────────────────────────────────────────────────────────

function FuelSection({ totalMinutes, fuelStart, fuelEnd, onFuelStart, onFuelEnd, fuelConsumed, gallonsPerHour }) {
  return (
    <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06] space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Fuel Tracker</p>
        {totalMinutes > 0 ? (
          <div className="flex items-center gap-1.5 bg-white/[0.06] rounded-full px-2.5 py-1">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="w-3 h-3 text-white/40">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-[11px] font-semibold text-white/60">{formatDuration(totalMinutes)}</span>
          </div>
        ) : (
          <span className="text-[11px] text-white/25">No leg times yet</span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label block mb-1.5">Start fuel</label>
          <div className="relative">
            <input type="text" inputMode="decimal" value={fuelStart}
              onChange={e => onFuelStart(e.target.value)}
              placeholder="180.0" className="input-field w-full pr-12" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">gal</span>
          </div>
        </div>
        <div>
          <label className="label block mb-1.5">End fuel</label>
          <div className="relative">
            <input type="text" inputMode="decimal" value={fuelEnd}
              onChange={e => onFuelEnd(e.target.value)}
              placeholder="148.0" className="input-field w-full pr-12" />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">gal</span>
          </div>
        </div>
      </div>

      {fuelConsumed !== null && fuelConsumed >= 0 && (
        <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.05]">
          <div>
            <p className="label mb-1">Consumed</p>
            <p className="text-xl font-bold text-white leading-tight">
              {fuelConsumed}<span className="text-xs text-white/40 font-normal ml-1">gal</span>
            </p>
          </div>
          {gallonsPerHour !== null && (
            <div>
              <p className="label mb-1">Rate</p>
              <p className="text-xl font-bold text-white leading-tight">
                {gallonsPerHour}<span className="text-xs text-white/40 font-normal ml-1">gal/h</span>
              </p>
            </div>
          )}
        </div>
      )}

      {fuelConsumed !== null && fuelConsumed < 0 && (
        <p className="text-xs text-red-400">End fuel can't exceed start fuel</p>
      )}
    </div>
  )
}

// ── Main drawer ────────────────────────────────────────────────────────────────

export default function FlightDrawer({ open, onClose, onSaved, editFlight }) {
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const { selectedAircraft, refreshAircraft } = useAircraft()
  const _now = new Date()
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const isEditing = !!editFlight

  const [date,          setDate]          = useState(today)
  const [pilot,         setPilot]         = useState('James McBride')
  const [legs,          setLegs]          = useState([emptyLeg()])
  const [cycles,        setCycles]        = useState('1')
  const [passengers,    setPassengers]    = useState([emptyPassenger(), emptyPassenger()])
  const [paxDropdown,   setPaxDropdown]   = useState(null)
  const paxDropdownRef = useRef(null)
  const [fuelStart,     setFuelStart]     = useState('')
  const [fuelEnd,       setFuelEnd]       = useState('')
  const [notes,         setNotes]         = useState('')
  const [preflightDone, setPreflightDone] = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Pre-fill form when opening
  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmDelete(false)

    if (isEditing && editFlight) {
      setDate(editFlight.date ?? today)
      setPilot(editFlight.pilot ?? '')
      setLegs(
        editFlight.legs?.length
          ? editFlight.legs.map(l => ({
              takeoff_time:     l.takeoff_time     ?? '',
              takeoff_location: l.takeoff_location ?? '',
              landing_time:     l.landing_time     ?? '',
              landing_location: l.landing_location ?? '',
            }))
          : [emptyLeg()]
      )
      setPassengers(
        editFlight.passengers?.length
          ? editFlight.passengers.map(p => ({
              name:   p.name   ?? '',
              weight: p.weight_lbs != null ? String(p.weight_lbs) : '',
            }))
          : []
      )
      setCycles(editFlight.cycles != null ? String(editFlight.cycles) : '1')
      setFuelStart(editFlight.fuel_start_gal != null ? String(editFlight.fuel_start_gal) : '')
      setFuelEnd(editFlight.fuel_end_gal     != null ? String(editFlight.fuel_end_gal)   : '')
      setNotes(editFlight.notes ?? '')
      setPreflightDone(true)
    } else {
      setDate(today)
      setPilot('James McBride')
      setLegs([emptyLeg()])
      setPassengers([emptyPassenger()])
      setCycles('1')
      setFuelStart('')
      setFuelEnd('')
      setNotes('')
      setPreflightDone(false)
      setPaxDropdown(null)
    }
  }, [open])

  // Close pax dropdown on outside click
  useEffect(() => {
    if (paxDropdown === null) return
    function handleOutside(e) {
      if (paxDropdownRef.current && !paxDropdownRef.current.contains(e.target)) {
        setPaxDropdown(null)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [paxDropdown])

  const updateLeg       = (i, field, val) =>
    setLegs(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l))
  const addLeg          = () => setLegs(prev => [...prev, emptyLeg()])
  const removeLeg       = (i) => setLegs(prev => prev.filter((_, idx) => idx !== i))

  const updatePassenger = (i, field, val) =>
    setPassengers(prev => prev.map((p, idx) => idx === i ? { ...p, [field]: val } : p))
  const addPassenger    = () => setPassengers(prev => [...prev, emptyPassenger()])
  const removePassenger = (i) => setPassengers(prev => prev.filter((_, idx) => idx !== i))

  const hasLegTimeError = legs.some(legTimeError)
  const totalMinutes   = legs.reduce((s, l) => s + calcLegMinutes(l), 0)
  const fuelStartNum   = parseFloat(fuelStart)
  const fuelEndNum     = parseFloat(fuelEnd)
  const fuelConsumed   = !isNaN(fuelStartNum) && !isNaN(fuelEndNum)
    ? ROUND(fuelStartNum - fuelEndNum) : null
  const gallonsPerHour = fuelConsumed != null && fuelConsumed >= 0 && totalMinutes > 0
    ? ROUND(fuelConsumed / (totalMinutes / 60)) : null
  const fuelFilled     = fuelStart !== '' && fuelEnd !== ''
    && !isNaN(fuelStartNum) && !isNaN(fuelEndNum) && fuelConsumed >= 0
  const legsComplete   = legs.some(l => l.takeoff_time && l.landing_time)

  function buildPassengersPayload() {
    const list = passengers.filter(p => p.name.trim())
    return list.length > 0
      ? list.map(p => ({ name: p.name.trim(), weight_lbs: p.weight ? Number(p.weight) : null }))
      : null
  }

  async function handleSave() {
    if (!selectedAircraft) return
    setError(null)
    setSaving(true)

    const cyclesNum = parseInt(cycles) || 0

    const sharedPayload = {
      date,
      pilot:             pilot || null,
      legs,
      total_minutes:     totalMinutes,
      cycles:            cyclesNum || null,
      fuel_start_gal:    isNaN(fuelStartNum) ? null : fuelStartNum,
      fuel_end_gal:      isNaN(fuelEndNum)   ? null : fuelEndNum,
      fuel_consumed_gal: fuelConsumed ?? null,
      passengers:        buildPassengersPayload(),
      notes:             notes.trim() || null,
    }

    if (isEditing) {
      const { error: err } = await supabase.from('flights').update(sharedPayload).eq('id', editFlight.id)
      if (err) { setSaving(false); setError(err.message); return }

      // Adjust Hobbs by the delta (both floored to nearest 0.1)
      const oldMins = editFlight.total_minutes ?? 0
      const delta   = toHobbs(totalMinutes) - toHobbs(oldMins)
      const cyclesDelta = cyclesNum - (editFlight.cycles ?? 0)

      const aircraftUpdates = {}
      if (Math.abs(delta) > 0.001)    aircraftUpdates.hobbs_current   = ROUND((selectedAircraft.hobbs_current  ?? 0) + delta)
      if (cyclesDelta !== 0)          aircraftUpdates.cycles_current  = (selectedAircraft.cycles_current ?? 0) + cyclesDelta
      if (Object.keys(aircraftUpdates).length)
        await supabase.from('aircraft').update(aircraftUpdates).eq('id', selectedAircraft.id)
    } else {
      const { error: err } = await supabase.from('flights').insert({
        aircraft_id: selectedAircraft.id,
        ...sharedPayload,
      })
      if (err) { setSaving(false); setError(err.message); return }

      const aircraftUpdates = {}
      if (totalMinutes > 0) aircraftUpdates.hobbs_current  = ROUND((selectedAircraft.hobbs_current  ?? 0) + toHobbs(totalMinutes))
      if (cyclesNum > 0)    aircraftUpdates.cycles_current = (selectedAircraft.cycles_current ?? 0) + cyclesNum
      if (Object.keys(aircraftUpdates).length)
        await supabase.from('aircraft').update(aircraftUpdates).eq('id', selectedAircraft.id)

      // Email notification — fire and forget
      fetch('/api/send-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'flight_log', data: sharedPayload }),
      }).catch(() => {})
    }

    setSaving(false)
    await refreshAircraft()
    onSaved?.()
    onClose()
  }

  async function handleDelete() {
    if (!editFlight || saving) return
    setSaving(true)

    const { error: err } = await supabase.from('flights').delete().eq('id', editFlight.id)
    if (err) { setSaving(false); setError(err.message); return }

    const oldMins   = editFlight.total_minutes ?? 0
    const oldCycles = editFlight.cycles ?? 0
    const aircraftUpdates = {}
    if (oldMins > 0)   aircraftUpdates.hobbs_current  = ROUND((selectedAircraft.hobbs_current  ?? 0) - toHobbs(oldMins))
    if (oldCycles > 0) aircraftUpdates.cycles_current = (selectedAircraft.cycles_current ?? 0) - oldCycles
    if (Object.keys(aircraftUpdates).length)
      await supabase.from('aircraft').update(aircraftUpdates).eq('id', selectedAircraft.id)

    setSaving(false)
    await refreshAircraft()
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

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-white">
              {isEditing ? 'Edit Flight' : 'Log Flight'}
            </h2>
            <p className="text-xs text-white/35 mt-0.5">
              {selectedAircraft?.tail_number} · {selectedAircraft?.make_model}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {totalMinutes > 0 && (
              <div className="text-right">
                <p className="text-[10px] text-white/35 uppercase tracking-widest">Total</p>
                <p className="text-sm font-bold text-white">{formatDuration(totalMinutes)}</p>
              </div>
            )}
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
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-2">

          {/* Date */}
          <div>
            <label className="label block mb-1.5">Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {/* Pilot */}
          <div>
            <label className="label block mb-1.5">Pilot</label>
            <div className="relative">
              <select
                value={pilot}
                onChange={e => setPilot(e.target.value)}
                className="input-field w-full appearance-none cursor-pointer pr-9"
              >
                {PILOTS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" className="w-4 h-4 text-white/30 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* Legs */}
          {legs.map((leg, i) => (
            <LegCard
              key={i}
              index={i}
              leg={leg}
              showIndex={legs.length > 1}
              onRemove={legs.length > 1 ? () => removeLeg(i) : null}
              onChange={(f, v) => updateLeg(i, f, v)}
              onAddLeg={i === legs.length - 1 ? addLeg : null}
              hasTimeError={legTimeError(leg)}
            />
          ))}

          {/* Cycles */}
          <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Engine Cycles</p>
              <span className="text-[11px] text-white/25">Engine starts this flight</span>
            </div>
            <div className="relative">
              <input
                type="text"
                inputMode="numeric"
                placeholder="1"
                value={cycles}
                onChange={e => setCycles(e.target.value.replace(/[^0-9]/g, ''))}
                className="input-field w-full pr-14 text-lg font-bold"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/25 pointer-events-none">cyc</span>
            </div>
          </div>

          {/* Passenger Manifest */}
          <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06] space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Passenger Manifest</p>
              {(() => {
                const total = passengers.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0)
                return total > 0 ? (
                  <span className={`text-[11px] font-semibold ${total > 650 ? 'text-red-400' : 'text-white/40'}`}>
                    {total} lb
                  </span>
                ) : null
              })()}</div>

            <div ref={paxDropdownRef} className="space-y-2">
              {passengers.map((p, i) => (
                <PassengerRow
                  key={i}
                  passenger={p}
                  showRemove={true}
                  onRemove={() => removePassenger(i)}
                  onChange={(field, val) => updatePassenger(i, field, val)}
                  dropdownOpen={paxDropdown === i}
                  onToggleDropdown={() => setPaxDropdown(paxDropdown === i ? null : i)}
                  onSelectFrequent={fp => { updatePassenger(i, 'name', fp.name); updatePassenger(i, 'weight', fp.weight); setPaxDropdown(null) }}
                />
              ))}
            </div>

            {passengers.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0) > 650 && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                <p className="text-xs text-red-400 font-medium text-center">Total weight exceeds 650 lb limit</p>
              </div>
            )}

            {passengers.length < 4 && (
              <div className="flex justify-center pt-1">
                <button
                  onClick={addPassenger}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl
                             border border-white/[0.08] text-[11px] font-medium text-white/30
                             active:bg-white/5 transition-colors select-none"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                    strokeLinecap="round" className="w-3 h-3">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add Passenger
                </button>
              </div>
            )}
          </div>

          {/* Fuel Tracker */}
          <FuelSection
            totalMinutes={totalMinutes}
            fuelStart={fuelStart}
            fuelEnd={fuelEnd}
            onFuelStart={setFuelStart}
            onFuelEnd={setFuelEnd}
            fuelConsumed={fuelConsumed}
            gallonsPerHour={gallonsPerHour}
          />

          {/* Pre-flight inspection */}
          <button
            type="button"
            onClick={() => setPreflightDone(v => !v)}
            className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-colors select-none
              ${preflightDone
                ? 'bg-white/[0.07] border-white/20'
                : 'bg-white/[0.03] border-white/[0.08]'}`}
          >
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors
              ${preflightDone ? 'bg-white border-white' : 'border-white/20'}`}>
              {preflightDone && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}
                  strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3 text-black">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </div>
            <p className={`text-sm font-semibold transition-colors ${preflightDone ? 'text-white' : 'text-white/40'}`}>
              Pre-flight inspection completed
            </p>
          </button>

          {/* Notes */}
          <div>
            <label className="label block mb-1.5">Additional notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Any relevant observations…"
              rows={3}
              className="input-field w-full resize-none"
            />
          </div>

        </div>

        {/* Error */}
        {error && (
          <p className="px-5 pt-2 text-xs text-red-400 flex-shrink-0">{error}</p>
        )}

        {/* Footer */}
        <div
          className="flex-shrink-0 border-t border-white/[0.06] px-5 pt-4 pb-4 space-y-3"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleSave}
            disabled={saving || !legsComplete || hasLegTimeError || !fuelFilled || !preflightDone}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm
                       flex items-center justify-center gap-2
                       active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Saving…</>
            ) : isEditing ? 'Update Flight' : 'Log Flight'}
          </button>

          {isEditing && !confirmDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full py-2.5 text-sm text-red-400/70 font-medium
                         active:text-red-400 transition-colors select-none"
            >
              Delete Flight
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

// ── Leg card ───────────────────────────────────────────────────────────────────

function LegCard({ index, leg, showIndex, onRemove, onChange, onAddLeg, hasTimeError }) {
  const mins = calcLegMinutes(leg)

  return (
    <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06] space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          {showIndex ? `Leg ${index + 1}` : 'Flight leg'}
        </p>
        <div className="flex items-center gap-3">
          {mins > 0 && (
            <span className="text-xs font-medium text-white/50">{formatDuration(mins)}</span>
          )}
          {onRemove && (
            <button onClick={onRemove}
              className="w-6 h-6 rounded-full bg-white/[0.07] flex items-center justify-center
                         text-white/30 active:text-white/60 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                strokeLinecap="round" className="w-3 h-3">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Takeoff row: time gets flexible width, ICAO fixed 76px */}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <label className="label block mb-1.5">Takeoff</label>
          <input type="time" value={leg.takeoff_time}
            onChange={e => onChange('takeoff_time', e.target.value)}
            className="input-field w-full" />
        </div>
        <div className="w-[76px] flex-shrink-0">
          <label className="label block mb-1.5">From</label>
          <input type="text" placeholder="ICAO" value={leg.takeoff_location}
            onChange={e => onChange('takeoff_location', e.target.value.toUpperCase())}
            maxLength={4} className="input-field w-full uppercase tracking-widest text-center px-2" />
        </div>
      </div>

      <div className="flex items-center gap-2 px-1">
        <div className="w-2 h-2 rounded-full border border-white/20 flex-shrink-0" />
        <div className="flex-1 border-t border-dashed border-white/10" />
        <img src="/helicopter.png" alt="helicopter"
          className="w-3.5 h-3.5 object-contain flex-shrink-0 opacity-20"
          style={{ filter: 'brightness(0) invert(1)' }} />
        <div className="flex-1 border-t border-dashed border-white/10" />
        <div className="w-2 h-2 rounded-full bg-white/20 flex-shrink-0" />
      </div>

      {/* Landing row: same proportions */}
      <div className="flex gap-2">
        <div className="flex-1 min-w-0">
          <label className="label block mb-1.5">Landing</label>
          <input type="time" value={leg.landing_time}
            onChange={e => onChange('landing_time', e.target.value)}
            className="input-field w-full" />
        </div>
        <div className="w-[76px] flex-shrink-0">
          <label className="label block mb-1.5">To</label>
          <input type="text" placeholder="ICAO" value={leg.landing_location}
            onChange={e => onChange('landing_location', e.target.value.toUpperCase())}
            maxLength={4} className="input-field w-full uppercase tracking-widest text-center px-2" />
        </div>
      </div>

      {hasTimeError && (
        <p className="text-xs text-red-400 text-center pt-1">
          Landing time is before takeoff — please check your times
        </p>
      )}

      {onAddLeg && (
        <div className="flex justify-center pt-1">
          <button
            onClick={onAddLeg}
            className="flex items-center gap-1.5 px-5 py-2.5 rounded-2xl
                       bg-white/[0.06] border border-white/[0.08]
                       text-xs font-medium text-white/40
                       active:bg-white/10 transition-colors select-none"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
              strokeLinecap="round" className="w-3 h-3">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add Leg
          </button>
        </div>
      )}
    </div>
  )
}
