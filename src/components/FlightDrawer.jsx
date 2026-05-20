import { useEffect, useRef, useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { supabase } from '../lib/supabase'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

const ROUND = (n, decimals = 2) => Math.round(n * 10 ** decimals) / 10 ** decimals

// Hobbs meters tick every 6 minutes → floor to nearest 0.1
const toHobbs = (minutes) => Math.floor(minutes / 6) / 10

const PILOTS = ['James McBride', 'Jay McMackin', 'Daniel Sandoval']

const ICAO_PRESETS = ['SALA', 'MSSS', 'MSLP', 'MGGT', 'MHTG']

const emptyLeg = () => ({
  takeoff_time:     '',
  takeoff_location: 'SALA',
  landing_time:     '',
  landing_location: 'SALA',
  actual_minutes:   null,  // pilot-adjusted air time (always ≤ calculated)
  wait_note:        '',    // reason for ground wait adjustment
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


function calcLegMinutesRaw(leg) {
  if (!leg.takeoff_time || !leg.landing_time) return 0
  const diff = toMinutes(leg.landing_time) - toMinutes(leg.takeoff_time)
  return diff > 0 ? diff : 0
}

function calcLegMinutes(leg) {
  // Use pilot-adjusted time if set, otherwise use raw calculated time
  if (leg.actual_minutes != null) return leg.actual_minutes
  return calcLegMinutesRaw(leg)
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
  const [copilot,       setCopilot]       = useState('')
  const [tachMode,      setTachMode]      = useState(false)
  const [tachNew,       setTachNew]       = useState('')
  const [tachModal,     setTachModal]     = useState(false)
  const [legConfirm,    setLegConfirm]    = useState(null) // { index, calculatedMins }
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
      setCopilot(editFlight.copilot ?? '')
      setLegs(
        editFlight.legs?.length
          ? editFlight.legs.map(l => ({
              takeoff_time:     l.takeoff_time     ?? '',
              takeoff_location: l.takeoff_location ?? '',
              landing_time:     l.landing_time     ?? '',
              landing_location: l.landing_location ?? '',
              actual_minutes:   l.actual_minutes   ?? null,
              wait_note:        l.wait_note        ?? '',
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
      setTachMode(false); setTachNew(''); setTachModal(false); setLegConfirm(null)
    } else {
      setDate(today)
      setPilot('James McBride')
      setCopilot('')
      setTachMode(false); setTachNew(''); setTachModal(false); setLegConfirm(null)
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
  const legMinutes     = legs.reduce((s, l) => s + calcLegMinutes(l), 0)
  const tachDelta      = tachMode && tachNew !== ''
    ? Math.max(0, ROUND(parseFloat(tachNew) - (selectedAircraft?.hobbs_current ?? 0), 1))
    : 0
  const tachMins       = Math.round(tachDelta * 60)
  const totalMinutes   = tachMode ? tachMins : legMinutes
  const fuelStartNum   = parseFloat(fuelStart)
  const fuelEndNum     = parseFloat(fuelEnd)
  const fuelConsumed   = !isNaN(fuelStartNum) && !isNaN(fuelEndNum)
    ? ROUND(fuelStartNum - fuelEndNum) : null
  const gallonsPerHour = fuelConsumed != null && fuelConsumed >= 0 && totalMinutes > 0
    ? ROUND(fuelConsumed / (totalMinutes / 60)) : null
  const fuelFilled     = fuelStart !== '' && fuelEnd !== ''
    && !isNaN(fuelStartNum) && !isNaN(fuelEndNum) && fuelConsumed >= 0
  const legsComplete   = tachMode ? tachDelta > 0 : legs.some(l => l.takeoff_time && l.landing_time)

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
      copilot:           copilot || null,
      legs:              tachMode ? [] : legs,
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
      if (tachMode && tachNew !== '') {
        // Set hobbs to the exact tach reading — this is ground truth
        aircraftUpdates.hobbs_current = ROUND(parseFloat(tachNew), 1)
      } else if (totalMinutes > 0) {
        aircraftUpdates.hobbs_current = ROUND((selectedAircraft.hobbs_current ?? 0) + toHobbs(totalMinutes))
      }
      if (cyclesNum > 0) aircraftUpdates.cycles_current = (selectedAircraft.cycles_current ?? 0) + cyclesNum
      if (Object.keys(aircraftUpdates).length)
        await supabase.from('aircraft').update(aircraftUpdates).eq('id', selectedAircraft.id)

      // Email is now sent via Supabase DB webhook on INSERT — no client call needed
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

      {/* Tach Modal — centered overlay above drawer panel */}
      {tachModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-black/60" onClick={() => setTachModal(false)} />
          <div className="relative w-full max-w-sm bg-navy-800 rounded-2xl border border-white/[0.10] p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Tachometer Reading</h3>
            <p className="text-xs text-white/35 mb-5">Enter the new air time shown on the tach after landing</p>

            {/* Current reading */}
            <div className="flex items-center justify-between bg-white/[0.05] rounded-xl px-4 py-3 mb-3">
              <span className="text-xs text-white/40">Current Air Time</span>
              <span className="text-sm font-bold text-white/60">
                {selectedAircraft?.hobbs_current?.toLocaleString()} h
              </span>
            </div>

            {/* New reading input */}
            <div className="mb-4">
              <label className="text-xs text-white/40 block mb-1.5">New Air Time Reading</label>
              <input
                type="text"
                placeholder={selectedAircraft?.hobbs_current?.toFixed(1)}
                value={tachNew}
                onChange={e => setTachNew(e.target.value)}
                className="input-field w-full text-lg font-bold pr-10"
                autoFocus
              />
            </div>

            {/* Live delta */}
            {tachNew !== '' && !isNaN(parseFloat(tachNew)) && parseFloat(tachNew) > (selectedAircraft?.hobbs_current ?? 0) && (
              <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-xl px-4 py-3 mb-5">
                <span className="text-xs text-accent/70">Flight Time</span>
                <span className="text-sm font-bold text-accent">
                  {ROUND(parseFloat(tachNew) - (selectedAircraft?.hobbs_current ?? 0), 1).toFixed(1)} h
                </span>
              </div>
            )}
            {tachNew !== '' && !isNaN(parseFloat(tachNew)) && parseFloat(tachNew) <= (selectedAircraft?.hobbs_current ?? 0) && (
              <p className="text-xs text-red-400 text-center mb-4">
                New reading must be greater than current air time
              </p>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setTachModal(false); setTachNew('') }}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.10]
                           border border-white/[0.08] text-sm text-white/50 hover:text-white/80 active:text-white/80
                           transition-all"
              >
                Cancel
              </button>
              <button
                disabled={tachNew === '' || isNaN(parseFloat(tachNew)) || parseFloat(tachNew) <= (selectedAircraft?.hobbs_current ?? 0)}
                onClick={() => { setTachMode(true); setTachModal(false) }}
                className="flex-1 py-2.5 rounded-xl bg-white hover:bg-white/90 active:bg-white/80
                           text-sm font-semibold text-navy-950
                           disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leg Air Time Confirmation Modal */}
      {legConfirm && (() => {
        const calcMins = legConfirm.calculatedMins
        return (
          <LegConfirmModal
            calculatedMins={calcMins}
            calculatedLabel={toHobbs(calcMins).toFixed(1)}
            currentMins={legConfirm.currentMins}
            from={legConfirm.from}
            to={legConfirm.to}
            takeoffTime={legConfirm.takeoffTime}
            landingTime={legConfirm.landingTime}
            onCancel={() => setLegConfirm(null)}
            onUseCalculated={() => {
              updateLeg(legConfirm.index, 'actual_minutes', null)
              updateLeg(legConfirm.index, 'wait_note', '')
              setLegConfirm(null)
            }}
            onConfirm={(actualMins, note) => {
              updateLeg(legConfirm.index, 'actual_minutes', actualMins)
              updateLeg(legConfirm.index, 'wait_note', note)
              setLegConfirm(null)
            }}
          />
        )
      })()}

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
            <label className="label block mb-1.5">Pilot in Command</label>
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

          {/* Co-Pilot */}
          {copilot === '' ? (
            <button
              type="button"
              onClick={() => setCopilot(PILOTS.find(p => p !== pilot) ?? '')}
              className="w-full flex items-center justify-center gap-2 text-sm text-white/50 hover:text-white/80 bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.08] rounded-xl py-2.5 transition-all"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Co-Pilot
            </button>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="label">Co-Pilot</label>
                <button
                  type="button"
                  onClick={() => setCopilot('')}
                  className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                >
                  Remove
                </button>
              </div>
              <div className="relative">
                <select
                  value={copilot}
                  onChange={e => setCopilot(e.target.value)}
                  className="input-field w-full appearance-none cursor-pointer pr-9"
                >
                  {PILOTS.filter(p => p !== pilot).map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" className="w-4 h-4 text-white/30 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
          )}

          {/* Legs or Tach */}
          {tachMode ? (
            <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Tachometer</p>
                <button
                  type="button"
                  onClick={() => { setTachMode(false); setTachNew('') }}
                  className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                >
                  Use legs instead
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-center flex-1">
                  <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">Before</p>
                  <p className="text-lg font-bold text-white/50">{selectedAircraft?.hobbs_current?.toLocaleString()}</p>
                </div>
                <svg viewBox="0 0 24 8" className="w-8 h-3 text-white/20 flex-shrink-0" fill="none">
                  <path d="M0 4h20M16 1l4 3-4 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <div className="text-center flex-1">
                  <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">After</p>
                  <p className="text-lg font-bold text-white">{parseFloat(tachNew).toLocaleString()}</p>
                </div>
                <div className="text-center flex-1">
                  <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">Flight Time</p>
                  <p className="text-lg font-bold text-accent">{tachDelta.toFixed(1)}h</p>
                </div>
              </div>
            </div>
          ) : (
            legs.map((leg, i) => (
              <LegCard
                key={i}
                index={i}
                leg={leg}
                showIndex={legs.length > 1}
                onRemove={legs.length > 1 ? () => removeLeg(i) : null}
                onChange={(f, v) => updateLeg(i, f, v)}
                onAddLeg={i === legs.length - 1 ? addLeg : null}
                onUseTach={i === legs.length - 1 ? () => setTachModal(true) : null}
                onLegComplete={(idx, calcMins, from, to, takeoffTime, landingTime, currentMins) =>
                  setLegConfirm({ index: idx, calculatedMins: calcMins, from, to, takeoffTime, landingTime, currentMins: currentMins ?? null })
                }
                hasTimeError={legTimeError(leg)}
              />
            ))
          )}

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
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2">
                <p className="text-xs text-amber-400 font-medium text-center">⚠️ Total weight exceeds 650 lb — verify W&B</p>
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

// ── ICAO picker field ──────────────────────────────────────────────────────────

function IcaoField({ value, onChange, onConfirm }) {
  const [open,      setOpen]      = useState(false)
  const [custom,    setCustom]    = useState(false)
  const [customVal, setCustomVal] = useState('')
  const ref       = useRef(null)
  const inputRef  = useRef(null)

  useEffect(() => {
    if (custom && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [custom])

  useEffect(() => {
    if (!open) return
    function outside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false); setCustom(false)
      }
    }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('touchstart', outside)
    }
  }, [open])

  function select(v) {
    onChange(v)
    onConfirm?.(v)
    setOpen(false); setCustom(false); setCustomVal('')
  }

  return (
    <div className="relative flex flex-col flex-1" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setCustom(false) }}
        className="input-field w-full flex-1 text-sm font-bold uppercase tracking-widest text-center px-1"
      >
        {value || <span className="text-white/30 text-xs font-normal normal-case tracking-normal">ICAO</span>}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 rounded-2xl border border-white/[0.10]
                        shadow-2xl p-2.5 w-[164px]"
             style={{ background: '#1c1c1e' }}>
          {!custom ? (
            <>
              <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                {ICAO_PRESETS.map(icao => (
                  <button
                    key={icao}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); select(icao) }}
                    className={`py-2 rounded-xl text-xs font-bold tracking-widest transition-colors select-none
                      ${value === icao
                        ? 'bg-white text-black'
                        : 'bg-white/[0.07] text-white/70 active:bg-white/[0.14]'
                      }`}
                  >
                    {icao}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setCustom(true)
                  setCustomVal(ICAO_PRESETS.includes(value) ? '' : (value || ''))
                }}
                className="w-full py-2 rounded-xl text-xs text-white/40 bg-white/[0.04]
                           active:bg-white/[0.08] transition-colors select-none"
              >
                Custom
              </button>
            </>
          ) : (
            <div className="space-y-2">
              <input
                ref={inputRef}
                type="text"
                maxLength={4}
                placeholder="ICAO"
                value={customVal}
                onChange={e => setCustomVal(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter' && customVal) select(customVal) }}
                className="input-field w-full text-center uppercase tracking-widest text-sm font-bold"
              />
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); setCustom(false) }}
                  className="flex-1 py-2 rounded-xl text-xs text-white/40 bg-white/[0.06]
                             active:bg-white/[0.10] transition-colors select-none"
                >
                  Back
                </button>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); if (customVal) select(customVal) }}
                  disabled={!customVal}
                  className="flex-1 py-2 rounded-xl text-xs font-semibold bg-white text-black
                             disabled:opacity-30 select-none"
                >
                  Set
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Leg card ───────────────────────────────────────────────────────────────────

function LegCard({ index, leg, showIndex, onRemove, onChange, onAddLeg, onUseTach, onLegComplete, hasTimeError }) {
  const mins    = calcLegMinutes(leg)
  const rawMins = calcLegMinutesRaw(leg)

  function handleToConfirm(toValue) {
    if (toValue && rawMins > 0 && leg.actual_minutes === null) {
      onLegComplete?.(index, rawMins, leg.takeoff_location, toValue, leg.takeoff_time, leg.landing_time)
    }
  }

  return (
    <div className="bg-white/[0.04] rounded-2xl p-4 border border-white/[0.06] space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">
          {showIndex ? `Leg ${index + 1}` : 'Air Time'}
        </p>
        <div className="flex items-center gap-3">
          {mins > 0 && (
            <span className="text-xs font-semibold text-white/50 tabular-nums">
              {formatDuration(mins)}
            </span>
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
      <div className="flex gap-2 items-stretch">
        <div className="flex-1 min-w-0 flex flex-col">
          <label className="label block mb-1.5">Takeoff</label>
          <input type="time" value={leg.takeoff_time}
            onChange={e => onChange('takeoff_time', e.target.value)}
            className="input-field w-full flex-1" />
        </div>
        <div className="w-[76px] flex-shrink-0 flex flex-col">
          <label className="label block mb-1.5">From</label>
          <IcaoField
            value={leg.takeoff_location}
            onChange={v => onChange('takeoff_location', v)}
          />
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
      <div className="flex gap-2 items-stretch">
        <div className="flex-1 min-w-0 flex flex-col">
          <label className="label block mb-1.5">Landing</label>
          <input type="time" value={leg.landing_time}
            onChange={e => { onChange('landing_time', e.target.value); onChange('actual_minutes', null) }}
            className="input-field w-full flex-1" />
        </div>
        <div className="w-[76px] flex-shrink-0 flex flex-col">
          <label className="label block mb-1.5">To</label>
          <IcaoField
            value={leg.landing_location}
            onChange={v => onChange('landing_location', v)}
            onConfirm={handleToConfirm}
          />
        </div>
      </div>

      {hasTimeError && (
        <p className="text-xs text-red-400 text-center pt-1">
          Landing time is before takeoff — please check your times
        </p>
      )}

      {/* Air time card — always visible once times are filled */}
      {!hasTimeError && rawMins > 0 && (() => {
        const isAdjusted = leg.actual_minutes != null && toHobbs(leg.actual_minutes) !== toHobbs(rawMins)
        return (
          <button
            onClick={() => onLegComplete?.(index, rawMins, leg.takeoff_location, leg.landing_location, leg.takeoff_time, leg.landing_time, leg.actual_minutes)}
            className="w-full text-left rounded-xl border border-white/[0.08] bg-white/[0.04]
                       active:bg-white/[0.07] transition-colors px-3.5 py-3 select-none"
          >
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-white/30 uppercase tracking-widest">
                {isAdjusted ? 'Air Time Adjustment' : 'Adjust Air Time'}
              </p>
              <div className="flex items-center gap-2 tabular-nums">
                {isAdjusted ? (
                  <>
                    <span className="text-[11px] text-white/30">{toHobbs(rawMins).toFixed(1)}h</span>
                    <svg viewBox="0 0 14 8" className="w-3 h-2 text-white/20 flex-shrink-0" fill="none">
                      <path d="M0 4h10M7 1.5l3 2.5-3 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <span className="text-sm font-bold text-white">{toHobbs(leg.actual_minutes).toFixed(1)}h</span>
                  </>
                ) : (
                  <span className="text-sm font-bold text-white">{toHobbs(rawMins).toFixed(1)}h</span>
                )}
              </div>
            </div>
            {isAdjusted && leg.wait_note ? (
              <p className="text-[11px] text-white/40 leading-snug border-t border-white/[0.05] mt-2 pt-2">
                {leg.wait_note}
              </p>
            ) : null}
          </button>
        )
      })()}

      {(onAddLeg || onUseTach) && (
        <div className="flex gap-2 pt-1">
          {onAddLeg && (
            <button
              onClick={onAddLeg}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                         bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.10]
                         border border-white/[0.08]
                         text-xs font-medium text-white/50 hover:text-white/80 active:text-white/80
                         transition-all select-none"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                strokeLinecap="round" className="w-3 h-3">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add Leg
            </button>
          )}
          {onUseTach && (
            <button
              onClick={onUseTach}
              disabled={rawMins > 0}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                         bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.10]
                         border border-white/[0.08]
                         text-xs font-medium text-white/50 hover:text-white/80 active:text-white/80
                         transition-all select-none
                         disabled:opacity-30 disabled:pointer-events-none"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="w-3 h-3">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 3" />
              </svg>
              Use Tach
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Leg Air Time Confirmation Modal ───────────────────────────────────────────

function LegConfirmModal({ calculatedMins, calculatedLabel, currentMins, from, to, takeoffTime, landingTime, onCancel, onUseCalculated, onConfirm }) {
  // Pre-fill with the previously adjusted value if re-opening, otherwise use calculated
  const [actualInput, setActualInput] = useState(
    currentMins != null ? toHobbs(currentMins).toFixed(1) : calculatedLabel
  )
  const [note,        setNote]        = useState('')

  // Hobbs decimal: 0.1 = 6 minutes, round to nearest 6-min tick
  const actualFloat = parseFloat(actualInput)
  const actualMins  = !isNaN(actualFloat) ? Math.round(actualFloat * 10) * 6 : NaN
  const isValid     = !isNaN(actualMins)
  const isReduced   = isValid && toHobbs(actualMins) < toHobbs(calculatedMins)
  const isInvalid   = isValid && toHobbs(actualMins) > toHobbs(calculatedMins)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.10] shadow-2xl overflow-hidden"
           style={{ background: '#0e0e10' }}>

        {/* ── Route card ── */}
        <div className="px-6 pt-6 pb-5" style={{ background: 'linear-gradient(160deg,#17171a,#111113)' }}>
          {/* ICAO + times row */}
          <div className="flex items-center justify-between mb-3">
            {/* Origin */}
            <div className="text-center w-16">
              <p className="text-2xl font-bold text-white tracking-widest leading-none">
                {from || '—'}
              </p>
              <p className="text-[11px] text-white/35 mt-1.5 font-mono">{takeoffTime || ''}</p>
            </div>

            {/* Flight path */}
            <div className="flex-1 flex items-center gap-1.5 px-2">
              <div className="flex-1 border-t border-dashed border-white/[0.12]" />
              <img src="/helicopter.png" alt=""
                className="w-4 h-4 object-contain opacity-30 flex-shrink-0"
                style={{ filter: 'brightness(0) invert(1)' }} />
              <div className="flex-1 border-t border-dashed border-white/[0.12]" />
            </div>

            {/* Destination */}
            <div className="text-center w-16">
              <p className="text-2xl font-bold text-white tracking-widest leading-none">
                {to || '—'}
              </p>
              <p className="text-[11px] text-white/35 mt-1.5 font-mono">{landingTime || ''}</p>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-white/[0.07] my-4" />

          {/* Calculated air time pill */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-white/30 uppercase tracking-widest">Calculated Air Time</span>
            <span className="text-sm font-bold text-white/50 tabular-nums">{calculatedLabel}h</span>
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-6 pt-5 pb-6 space-y-4">
          <div>
            <p className="text-sm font-bold text-white mb-0.5">Confirm Air Time</p>
            <p className="text-xs text-white/35">
              Adjust down if the helicopter waited on the ground
            </p>
          </div>

          {/* Actual air time input */}
          <div>
            <label className="text-xs text-white/40 block mb-1.5">Actual Air Time</label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                placeholder={calculatedLabel}
                value={actualInput}
                onChange={e => setActualInput(e.target.value)}
                className="input-field w-full pr-8 text-lg font-bold tabular-nums"
                autoFocus
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none">h</span>
            </div>

            {isInvalid && (
              <p className="text-xs text-red-400 mt-1.5">Cannot exceed calculated time ({calculatedLabel}h)</p>
            )}
            {isReduced && (
              <p className="text-xs text-white/30 mt-1.5">
                Ground wait: <span className="text-accent/70 font-semibold">{toHobbs(calculatedMins - actualMins).toFixed(1)}h</span>
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="text-xs text-white/40 block mb-1.5">Note</label>
            <input
              type="text"
              placeholder="e.g. Waited 12 min on ground at Costa del Sol"
              value={note}
              onChange={e => setNote(e.target.value)}
              className="input-field w-full text-sm"
            />
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onUseCalculated}
              className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.10]
                         border border-white/[0.08] text-sm text-white/50 hover:text-white/80 active:text-white/80
                         transition-all"
            >
              Use Calculated
            </button>
            <button
              disabled={isInvalid || !isValid}
              onClick={() => onConfirm(actualMins, note.trim())}
              className="flex-1 py-2.5 rounded-xl bg-white hover:bg-white/90 active:bg-white/80
                         text-sm font-semibold text-navy-950
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
