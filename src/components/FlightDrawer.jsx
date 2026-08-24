import { useEffect, useRef, useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { useTeam } from '../context/TeamContext'
import { RPC_MISSING } from '../lib/softDelete'
import { getAccessToken } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

const ROUND = (n, decimals = 2) => Math.round(n * 10 ** decimals) / 10 ** decimals

// Hobbs meters tick every 6 minutes → floor to nearest 0.1
const toHobbs = (minutes) => Math.round(minutes / 6) / 10

// Parses a typed rate like "1,350.00"; returns null (never a silent default) when invalid.
function parseRate(str) {
  const n = parseFloat(String(str ?? '').replace(/,/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}
const TACH_MAX_DELTA = 10   // hours; one flight adding more than this needs explicit confirmation

const ICAO_PRESETS = ['SALA', 'MSSS', 'MSLP', 'MGGT', 'MHTG']

const emptyLeg = () => ({
  takeoff_time:     '',
  takeoff_location: '',
  landing_time:     '',
  landing_location: '',
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
          <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-xl overflow-hidden bg-[#1c1c1e] shadow-xl">
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
    <div className="bg-white/[0.04] rounded-2xl p-4 space-y-4">
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
  const PILOTS = useTeam().pilots.map(p => p.name)
  const DEFAULT_PILOT = PILOTS[0] ?? ''
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const { selectedAircraft, refreshAircraft } = useAircraft()
  const _now = new Date()
  const today = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, '0')}-${String(_now.getDate()).padStart(2, '0')}`
  const isEditing = !!editFlight

  const [date,          setDate]          = useState(today)
  const [pilot,         setPilot]         = useState(DEFAULT_PILOT)
  const [copilot,       setCopilot]       = useState('')
  const [tachMode,      setTachMode]      = useState(false)
  const [tachNew,       setTachNew]       = useState('')
  const [tachModal,     setTachModal]     = useState(false)
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

  // ── Flight Time state ──────────────────────────────────────────────────────
  const [ftMethod,    setFtMethod]    = useState(null)
  const [ftMins,      setFtMins]      = useState(null)
  const [ftModal,     setFtModal]     = useState(null)
  const [ftHobbsNew,  setFtHobbsNew]  = useState('')

  // ── Revenue receipt state ───────────────────────────────────────────────────
  const [receiptRate,     setReceiptRate]     = useState('1,350.00')
  const [tachConfirmBig,  setTachConfirmBig]  = useState(false)   // typo guard for large tach deltas
  const [receiptParty,    setReceiptParty]    = useState('')
  const [receiptCategory, setReceiptCategory] = useState('Flight Hours')
  const [receiptEditing,  setReceiptEditing]  = useState(false)
  const [sentToMonies,    setSentToMonies]    = useState(false)
  const [sendingMonies,   setSendingMonies]   = useState(false)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  // Pre-fill form when opening
  useEffect(() => {
    if (!open) return
    setError(null)
    setConfirmDelete(false)
    setSentToMonies(false)
    setSendingMonies(false)
    // One idempotency key per drawer session: a double-tap or a retry after a
    // network error can never post the same revenue twice.
    moniesKey.current = isEditing && editFlight ? `flight:${editFlight.id}` : crypto.randomUUID()

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
      setTachMode(false); setTachNew(''); setTachModal(false)
      setFtMins(editFlight.flight_time_minutes ?? null)
      setFtMethod(editFlight.flight_time_minutes != null ? 'saved' : null)
      setFtModal(null); setFtHobbsNew('')
    } else {
      setDate(today)
      setPilot(DEFAULT_PILOT)
      setCopilot('')
      setTachMode(false); setTachNew(''); setTachModal(false)
      setLegs([emptyLeg()])
      setPassengers([emptyPassenger()])
      setCycles('1')
      setFuelStart('')
      setFuelEnd('')
      setNotes('')
      setPreflightDone(false)
      setPaxDropdown(null)
      setFtMethod(null); setFtMins(null); setFtModal(null); setFtHobbsNew('')
      setReceiptRate('1,350.00'); setReceiptParty(''); setReceiptCategory('Flight Hours'); setReceiptEditing(false)
    }
  }, [open])

  // Auto-fill receipt party from first named passenger
  useEffect(() => {
    const first = passengers.find(p => p.name.trim())
    if (first) setReceiptParty(first.name.trim())
  }, [passengers])

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
  const ftComplete     = isEditing || (ftMins != null && ftMins > 0)
  const ftUnderAirTime = ftMins != null && totalMinutes > 0 && ftMins < totalMinutes

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

    const cyclesNum = cycles === '' ? 0 : parseInt(cycles, 10)
    if (isNaN(cyclesNum) || cyclesNum < 0 || String(cyclesNum) !== String(cycles).trim()) {
      setSaving(false); setError('Cycles must be a whole number (0 or more)'); return
    }

    const sharedPayload = {
      date,
      pilot:                pilot || null,
      copilot:              copilot || null,
      legs:                 tachMode ? [] : legs,
      total_minutes:        totalMinutes,
      flight_time_minutes:  ftMins ?? null,
      cycles:               cyclesNum || null,
      fuel_start_gal:       isNaN(fuelStartNum) ? null : fuelStartNum,
      fuel_end_gal:         isNaN(fuelEndNum)   ? null : fuelEndNum,
      fuel_consumed_gal:    fuelConsumed ?? null,
      passengers:           buildPassengersPayload(),
      notes:                notes.trim() || null,
    }

    // ── Preferred path: one atomic server call (flight + aircraft hours together) ──
    // save_flight() computes hobbs = hobbs + delta from the database row, so two
    // phones logging at once can't overwrite each other, and a dropped connection
    // can't leave a flight saved without its hours (or vice-versa).
    const rpcPayload = {
      ...sharedPayload,
      ...(isEditing ? { id: editFlight.id } : { aircraft_id: selectedAircraft.id }),
      ...(!isEditing && tachMode && tachNew !== ''              ? { tach_reading:       ROUND(parseFloat(tachNew), 1) }     : {}),
      ...(!isEditing && ftMethod === 'hobbs' && ftHobbsNew !== '' ? { flight_hobbs_after: ROUND(parseFloat(ftHobbsNew), 1) } : {}),
    }
    const { error: rpcErr } = await supabase.rpc('save_flight', { p_flight: rpcPayload })

    if (rpcErr && !RPC_MISSING(rpcErr)) { setSaving(false); setError(rpcErr.message); return }

    if (rpcErr && RPC_MISSING(rpcErr)) {
      // ── Legacy path (migration not yet run): two separate writes ──
      await legacySave(sharedPayload, cyclesNum)
      if (legacyFailed.current) { setSaving(false); return }
    }

    setSaving(false)
    await refreshAircraft()
    onSaved?.()
    onClose()
  }

  // Old two-write save, kept only until migrations/2026-08-22-flight-hours-atomic-soft-delete.sql runs.
  const legacyFailed = useRef(false)
  const moniesKey = useRef(null)
  async function legacySave(sharedPayload, cyclesNum) {
    legacyFailed.current = false
    if (isEditing) {
      const { error: err } = await supabase.from('flights').update(sharedPayload).eq('id', editFlight.id)
      if (err) { legacyFailed.current = true; setError(err.message); return }

      const oldMins = editFlight.total_minutes ?? 0
      const delta   = toHobbs(totalMinutes) - toHobbs(oldMins)
      const cyclesDelta = cyclesNum - (editFlight.cycles ?? 0)
      const aircraftUpdates = {}
      if (Math.abs(delta) > 0.001)    aircraftUpdates.hobbs_current   = ROUND((selectedAircraft.hobbs_current  ?? 0) + delta)
      if (cyclesDelta !== 0)          aircraftUpdates.cycles_current  = (selectedAircraft.cycles_current ?? 0) + cyclesDelta
      if (Object.keys(aircraftUpdates).length) {
        const { error: acErr } = await supabase.from('aircraft').update(aircraftUpdates).eq('id', selectedAircraft.id)
        if (acErr) { legacyFailed.current = true; setError(`Flight saved but aircraft hours were NOT updated: ${acErr.message}`); return }
      }
    } else {
      const { error: err } = await supabase.from('flights').insert({ aircraft_id: selectedAircraft.id, ...sharedPayload })
      if (err) { legacyFailed.current = true; setError(err.message); return }

      const aircraftUpdates = {}
      if (tachMode && tachNew !== '') {
        aircraftUpdates.hobbs_current = ROUND(parseFloat(tachNew), 1)
      } else if (totalMinutes > 0) {
        aircraftUpdates.hobbs_current = ROUND((selectedAircraft.hobbs_current ?? 0) + toHobbs(totalMinutes))
      }
      if (cyclesNum > 0) aircraftUpdates.cycles_current = (selectedAircraft.cycles_current ?? 0) + cyclesNum
      if (ftMethod === 'hobbs' && ftHobbsNew !== '')
        aircraftUpdates.flight_hobbs_current = ROUND(parseFloat(ftHobbsNew), 1)
      if (Object.keys(aircraftUpdates).length) {
        const { error: acErr } = await supabase.from('aircraft').update(aircraftUpdates).eq('id', selectedAircraft.id)
        if (acErr) { legacyFailed.current = true; setError(`Flight saved but aircraft hours were NOT updated: ${acErr.message}`); return }
      }
    }
  }

  function exportFlightCSV() {
    const hobbsHours = toHobbs(ftMins ?? 0)
    const rate       = parseRate(receiptRate)
    if (rate == null) { setError('Rate must be a number greater than 0'); return }
    const amount     = Math.round(hobbsHours * rate * 100) / 100

    const firstLeg = legs[0]
    const lastLeg  = legs[legs.length - 1]
    const from     = firstLeg?.takeoff_location ?? ''
    const to       = lastLeg?.landing_location  ?? ''

    // Air time = sum of actual_minutes or tach-derived minutes across legs
    const airTimeMins = legs.reduce((sum, l) => {
      const raw = (() => {
        if (l.takeoff_time && l.landing_time) {
          const [th, tm] = l.takeoff_time.split(':').map(Number)
          const [lh, lm] = l.landing_time.split(':').map(Number)
          return (lh * 60 + lm) - (th * 60 + tm)
        }
        return 0
      })()
      return sum + (l.actual_minutes ?? (raw > 0 ? raw : 0))
    }, 0)

    const paxList = passengers
      .filter(p => p.name.trim())
      .map(p => p.name.trim() + (p.weight ? ` (${p.weight} lbs)` : ''))
      .join('; ')

    const headers = ['Date','Pilot','Copilot','From','To','Legs','Passengers','Cycles',
                     'Flight Time (h)','Air Time (h)','Category','Client','Rate ($/hr)','Amount ($)','Notes']

    const row = [
      date,
      pilot,
      copilot,
      from,
      to,
      legs.length,
      paxList,
      cycles,
      hobbsHours.toFixed(1),
      toHobbs(airTimeMins).toFixed(1),
      receiptCategory,
      receiptParty,
      rate.toFixed(2),
      amount.toFixed(2),
      notes.replace(/"/g, '""'),
    ]

    const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv    = [headers.map(escape).join(','), row.map(escape).join(',')].join('\n')
    const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href       = url
    a.download   = `flight-${date}-${from || 'log'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleSendToMonies() {
    setSendingMonies(true)
    try {
      const hobbsHours  = toHobbs(ftMins ?? 0)
      const rate        = parseRate(receiptRate)
      if (rate == null) { setError('Rate must be a number greater than 0'); return }
      const amount      = Math.round(hobbsHours * rate * 100) / 100
      const payload     = {
        amount,
        party:       receiptParty.trim() || null,
        notes:       notes.trim() || null,
        date,
        flight_time: `${hobbsHours.toFixed(1)}h`,
        rate_per_hr: rate,
        pilot,
        category:    receiptCategory,
        status:      'pending',
      }
      const token = await getAccessToken()   // null while login is disabled
      const resp = await fetch('/api/create-monies-transaction', {
        method:  'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ ...payload, idempotency_key: moniesKey.current }),
      })
      if (resp.status === 409) { setSentToMonies(true); return }   // already sent — treat as success
      if (!resp.ok) {
        let errMsg = `HTTP ${resp.status}`
        try { const j = await resp.json(); errMsg = j.error || errMsg } catch {}
        throw new Error(errMsg)
      }
      setSentToMonies(true)
    } catch (err) {
      console.error('[monies]', err.message)
      setError(`CNA Monies error: ${err.message}`)
    } finally {
      setSendingMonies(false)
    }
  }

  async function handleDelete() {
    if (!editFlight || saving) return
    setSaving(true)

    // Preferred: soft-delete + hours adjustment in one transaction (recoverable with restore_flight)
    const { error: rpcErr } = await supabase.rpc('delete_flight', { p_id: editFlight.id })
    if (rpcErr && !RPC_MISSING(rpcErr)) { setSaving(false); setError(rpcErr.message); return }

    if (rpcErr && RPC_MISSING(rpcErr)) {
      // Legacy path (migration not yet run): hard delete, then adjust aircraft
      const { error: err } = await supabase.from('flights').delete().eq('id', editFlight.id)
      if (err) { setSaving(false); setError(err.message); return }
      const oldMins   = editFlight.total_minutes ?? 0
      const oldCycles = editFlight.cycles ?? 0
      const aircraftUpdates = {}
      if (oldMins > 0)   aircraftUpdates.hobbs_current  = ROUND((selectedAircraft.hobbs_current  ?? 0) - toHobbs(oldMins))
      if (oldCycles > 0) aircraftUpdates.cycles_current = (selectedAircraft.cycles_current ?? 0) - oldCycles
      if (Object.keys(aircraftUpdates).length) {
        const { error: acErr } = await supabase.from('aircraft').update(aircraftUpdates).eq('id', selectedAircraft.id)
        if (acErr) { setSaving(false); setError(`Flight deleted but aircraft hours were NOT adjusted: ${acErr.message}`); return }
      }
    }

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
          <div className="relative w-full max-w-sm bg-navy-800 rounded-2xl p-6 shadow-2xl">
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
            {/* Typo guard: a single flight adding more than TACH_MAX_DELTA hours is almost certainly a mistyped digit */}
            {tachNew !== '' && !isNaN(parseFloat(tachNew)) && parseFloat(tachNew) - (selectedAircraft?.hobbs_current ?? 0) > TACH_MAX_DELTA && (
              <label className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/25 rounded-xl px-4 py-3 mb-4 cursor-pointer">
                <input type="checkbox" checked={tachConfirmBig} onChange={e => setTachConfirmBig(e.target.checked)}
                  className="mt-0.5 accent-red-500" />
                <span className="text-xs text-red-300">
                  This adds <b>{ROUND(parseFloat(tachNew) - (selectedAircraft?.hobbs_current ?? 0), 1).toFixed(1)} h</b> in one flight
                  (more than {TACH_MAX_DELTA} h). Tick to confirm the reading is correct.
                </span>
              </label>
            )}

            {/* Buttons */}
            <div className="flex gap-3">
              <button
                onClick={() => { setTachModal(false); setTachNew('') }}
                className="flex-1 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.10]
                           text-sm text-white/50 hover:text-white/80 active:text-white/80
                           transition-all"
              >
                Cancel
              </button>
              <button
                disabled={tachNew === '' || isNaN(parseFloat(tachNew)) || parseFloat(tachNew) <= (selectedAircraft?.hobbs_current ?? 0)
                  || (parseFloat(tachNew) - (selectedAircraft?.hobbs_current ?? 0) > TACH_MAX_DELTA && !tachConfirmBig)}
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

      {/* Flight Time modals */}
      {ftModal === 'engine' && (
        <FlightEngineModal
          onCancel={() => setFtModal(null)}
          onConfirm={mins => { setFtMins(mins); setFtMethod('engine'); setFtModal(null) }}
        />
      )}
      {ftModal === 'hobbs' && (
        <FlightHobbsModal
          currentHobbs={selectedAircraft?.flight_hobbs_current ?? 0}
          onCancel={() => setFtModal(null)}
          onConfirm={(mins, newHobbs) => { setFtMins(mins); setFtMethod('hobbs'); setFtHobbsNew(String(newHobbs)); setFtModal(null) }}
        />
      )}
      {ftModal === 'timer' && (
        <FlightTimerModal
          initialMins={ftMins}
          onCancel={() => { setFtMins(null); setFtMethod(null); setFtModal(null) }}
          onConfirm={mins => { setFtMins(mins); setFtMethod('timer'); setFtModal(null) }}
        />
      )}


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
              className="w-full flex items-center justify-center gap-2 text-sm text-white/50 hover:text-white/80 bg-white/[0.06] hover:bg-white/[0.10] rounded-xl py-2.5 transition-all"
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

          {/* Flight Time */}
          <div className={`bg-white/[0.04] rounded-2xl p-4 border space-y-3 ${ftUnderAirTime ? 'border-red-500/30' : 'border-white/[0.06]'}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest">Flight Time</p>
            </div>

            {/* Flight time < air time warning */}
            {ftUnderAirTime && (
              <div className="flex items-start gap-2.5 bg-red-500/[0.08] border border-red-500/20 rounded-xl px-3.5 py-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <p className="text-[11px] text-red-400 leading-snug">
                  Flight time ({toHobbs(ftMins).toFixed(1)}h) cannot be less than air time ({toHobbs(totalMinutes).toFixed(1)}h). Please correct before logging.
                </p>
              </div>
            )}

            {/* Recorded result — tap to re-edit */}
            {ftMins != null ? (
              <button
                onClick={() => setFtModal(ftMethod === 'saved' ? 'timer' : ftMethod)}
                className="w-full text-left bg-white/[0.04] rounded-xl px-3.5 py-3.5
                           active:bg-white/[0.07] transition-colors select-none"
              >
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-white/30 uppercase tracking-widest">
                    {ftMethod === 'engine' ? 'Engine Starter' : ftMethod === 'hobbs' ? 'Hobbs' : 'Timer'}
                  </p>
                  <span className="text-lg font-bold text-white tabular-nums">{toHobbs(ftMins).toFixed(1)}h</span>
                </div>
              </button>
            ) : (
              <div className="flex rounded-2xl overflow-hidden">
                {[
                  { key: 'engine', label: 'Engine Starter' },
                  { key: 'hobbs',  label: 'Hobbs'          },
                  { key: 'timer',  label: 'Timer'          },
                ].map(({ key, label }, i, arr) => (
                  <button
                    key={key}
                    onClick={() => setFtModal(key)}
                    className={`flex-1 py-3 text-xs font-semibold select-none transition-colors
                      ${i < arr.length - 1 ? 'border-r border-white/[0.08]' : ''}
                      ${ftMethod === key
                        ? 'bg-white text-black'
                        : 'bg-white/[0.04] text-white/40 active:bg-white/[0.08]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Air Time */}
          {tachMode ? (
            <div className="bg-white/[0.04] rounded-2xl p-4 space-y-3">
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
                  <p className="text-[10px] text-white/30 uppercase tracking-wide mb-1">Air Time</p>
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
                onLegComplete={null}
                hasTimeError={legTimeError(leg)}
              />
            ))
          )}

          {/* Cycles */}
          <div className="bg-white/[0.04] rounded-2xl p-4">
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
          <div className="bg-white/[0.04] rounded-2xl p-4 space-y-3">
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
                             text-[11px] font-medium text-white/30
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

          {/* Revenue Receipt — only shown when flight time is recorded */}
          {ftMins != null && ftMins > 0 && (() => {
            const hobbsHours   = toHobbs(ftMins)
            const rate         = parseRate(receiptRate) ?? 0
            const amount       = Math.round(hobbsHours * rate * 100) / 100

            return (
              <div className="rounded-2xl overflow-hidden"
                   style={{ background: 'linear-gradient(160deg,#17171a,#111113)' }}>

                {/* Receipt header */}
                <div className="px-5 pt-5 pb-4 flex items-start justify-between border-b border-white/[0.07]">
                  <div>
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2">Flight Revenue</p>
                    <p className="text-3xl font-bold text-white tabular-nums">
                      ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-[11px] text-white/35 mt-1.5">{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {/* Export CSV */}
                    <button
                      type="button"
                      onClick={exportFlightCSV}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest
                                 bg-white/[0.06] text-white/40 active:bg-white/[0.10] transition-colors select-none"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                        strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                      CSV
                    </button>
                    {/* Edit / Done */}
                    <button
                      type="button"
                      onClick={() => setReceiptEditing(e => !e)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-semibold uppercase tracking-widest transition-colors select-none
                        ${receiptEditing
                          ? 'bg-white text-black'
                          : 'bg-white/[0.06] text-white/40 active:bg-white/[0.10]'
                        }`}
                    >
                      {receiptEditing ? 'Done' : 'Edit'}
                    </button>
                  </div>
                </div>

                {/* Category */}
                <div className="px-5 pt-4 pb-3 border-b border-white/[0.07]">
                  <p className="text-[10px] text-white/30 uppercase tracking-widest mb-2.5">Category</p>
                  {receiptEditing ? (
                    <div className="grid grid-cols-3 gap-1.5">
                      {['Flight Hours', 'Air Tours', 'Custom Flights'].map(cat => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setReceiptCategory(cat)}
                          className={`py-2 px-1 rounded-xl text-[11px] font-semibold transition-colors select-none
                            ${receiptCategory === cat
                              ? 'bg-white text-black'
                              : 'bg-white/[0.06] text-white/40 active:bg-white/[0.10]'
                            }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px] font-semibold text-white">{receiptCategory}</p>
                  )}
                </div>

                {/* Receipt rows */}
                <div className="px-5 py-4 space-y-3.5">

                  {/* Client */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/35">Client</span>
                    {receiptEditing ? (
                      <input
                        type="text"
                        value={receiptParty}
                        onChange={e => setReceiptParty(e.target.value)}
                        placeholder="Passenger name"
                        className="text-[12px] font-semibold text-white bg-transparent text-right
                                   outline-none placeholder:text-white/20 w-44 transition-colors"
                      />
                    ) : (
                      <span className="text-[12px] font-semibold text-white">{receiptParty || <span className="text-white/25">—</span>}</span>
                    )}
                  </div>

                  {/* Flight time */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/35">Flight Time</span>
                    <span className="text-[12px] font-semibold text-white tabular-nums">{hobbsHours.toFixed(1)}h</span>
                  </div>

                  {/* Air time */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/35">Air Time</span>
                    <span className="text-[12px] font-semibold text-white tabular-nums">{toHobbs(totalMinutes).toFixed(1)}h</span>
                  </div>

                  {/* Rate */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/35">Rate</span>
                    {receiptEditing ? (
                      <input
                        type="text"
                        inputMode="decimal"
                        value={receiptRate}
                        onChange={e => setReceiptRate(e.target.value.replace(/[^0-9.,]/g, ''))}
                        onFocus={e => e.target.select()}
                        onBlur={e => {
                          const n = parseFloat(e.target.value.replace(/,/g, '')) || 0
                          setReceiptRate(n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
                        }}
                        className="text-[12px] font-semibold text-white bg-transparent text-right
                                   outline-none tabular-nums w-28 transition-colors"
                      />
                    ) : (
                      <span className="text-[12px] font-semibold text-white tabular-nums">${receiptRate}</span>
                    )}
                  </div>

                  {/* Pilot */}
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] text-white/35">Pilot</span>
                    <span className="text-[12px] font-semibold text-white">{pilot}</span>
                  </div>

                  {/* Notes */}
                  {notes.trim() && (
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-[11px] text-white/35 flex-shrink-0">Notes</span>
                      <span className="text-[11px] text-white/60 text-right leading-snug">{notes.trim()}</span>
                    </div>
                  )}

                </div>

                {/* Send button */}
                <div className="px-5 pb-5">
                  {sentToMonies ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 py-3 rounded-xl bg-white/[0.06]
                                      flex items-center justify-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                          strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-emerald-400">
                          <path d="M20 6L9 17l-5-5"/>
                        </svg>
                        <span className="text-sm font-semibold text-emerald-400">Sent to CNA Monies</span>
                      </div>
                      <button
                        onClick={() => setSentToMonies(false)}
                        className="py-3 px-3 rounded-xl bg-white/[0.06]
                                   text-[11px] text-white/40 active:opacity-60 select-none"
                      >
                        Resend
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={handleSendToMonies}
                      disabled={sendingMonies}
                      className="w-full py-3 rounded-xl font-semibold text-sm transition-all select-none
                                 bg-white text-black active:scale-[0.98] disabled:opacity-50
                                 flex items-center justify-center gap-2"
                    >
                      {sendingMonies ? (
                        <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Sending…</>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                            strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                          </svg>
                          Send to CNA Monies
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            )
          })()}

        </div>

        {/* Error */}
        {error && (
          <p className="px-5 pt-2 text-xs text-red-400 flex-shrink-0">{error}</p>
        )}

        {/* Footer */}
        <div
          className="flex-shrink-0 border-t border-white/[0.05] px-5 pt-4 pb-4 space-y-3"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleSave}
            disabled={saving || !legsComplete || hasLegTimeError || !fuelFilled || !preflightDone || !ftComplete || ftUnderAirTime}
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

// ── Flight Time modals ─────────────────────────────────────────────────────────

function FlightEngineModal({ onCancel, onConfirm }) {
  const [engineOn,  setEngineOn]  = useState('')
  const [engineOff, setEngineOff] = useState('')

  const diff     = toMinutes(engineOff) - toMinutes(engineOn)
  const isValid  = engineOn && engineOff && diff > 0
  const mins     = isValid ? diff : 0

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: '#0e0e10' }}>
        <div className="px-6 pt-6 pb-4" style={{ background: 'linear-gradient(160deg,#17171a,#111113)' }}>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Flight Time</p>
          <p className="text-lg font-bold text-white">Engine Starter</p>
        </div>
        <div className="px-6 pt-5 pb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 block mb-1.5">Engine On</label>
              <input type="time" value={engineOn} onChange={e => setEngineOn(e.target.value)}
                className="input-field w-full" />
            </div>
            <div>
              <label className="text-xs text-white/40 block mb-1.5">Engine Off</label>
              <input type="time" value={engineOff} onChange={e => setEngineOff(e.target.value)}
                className="input-field w-full" />
            </div>
          </div>
          {isValid && (
            <div className="flex items-center justify-between bg-white/[0.05] rounded-xl px-4 py-3">
              <span className="text-xs text-white/40">Flight Time</span>
              <span className="text-sm font-bold text-white tabular-nums">{toHobbs(mins).toFixed(1)}h</span>
            </div>
          )}
          {engineOn && engineOff && !isValid && (
            <p className="text-xs text-red-400 text-center">Engine off must be after engine on</p>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-sm text-white/50">
              Cancel
            </button>
            <button disabled={!isValid} onClick={() => onConfirm(mins)}
              className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-30">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlightHobbsModal({ currentHobbs, onCancel, onConfirm }) {
  const [newHobbs, setNewHobbs] = useState('')
  const current   = currentHobbs ?? 0
  const newVal    = parseFloat(newHobbs)
  const isValid   = !isNaN(newVal) && newVal > current
  const delta     = isValid ? ROUND(newVal - current, 1) : 0
  const deltaMins = Math.round(delta * 60)
  const display   = String(current.toFixed(1)).padStart(6, '0')

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: '#0e0e10' }}>
        <div className="px-6 pt-6 pb-4" style={{ background: 'linear-gradient(160deg,#17171a,#111113)' }}>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Flight Time</p>
          <p className="text-lg font-bold text-white">Hobbs Reading</p>
        </div>
        <div className="px-6 pt-5 pb-6 space-y-4">
          <div className="space-y-3">
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">Current</p>
              <div className="bg-white/[0.04] rounded-xl px-4 h-14 flex items-center justify-center">
                <p className="text-2xl font-bold text-white/40 tabular-nums font-mono tracking-widest">{display}</p>
              </div>
            </div>
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">New Reading</p>
              <input type="text" inputMode="decimal" placeholder={current.toFixed(1)}
                value={newHobbs} onChange={e => setNewHobbs(e.target.value)}
                autoFocus className="input-field w-full h-14 text-2xl font-bold tabular-nums text-center" />
            </div>
          </div>
          {isValid && (
            <div className="flex items-center justify-between bg-accent/10 border border-accent/20 rounded-xl px-4 py-3">
              <span className="text-xs text-accent/70">Flight Time</span>
              <span className="text-sm font-bold text-accent tabular-nums">{delta.toFixed(1)}h</span>
            </div>
          )}
          {newHobbs !== '' && !isNaN(newVal) && newVal <= current && (
            <p className="text-xs text-red-400 text-center">New reading must be greater than current ({current.toFixed(1)})</p>
          )}
          <div className="flex gap-3 pt-1">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-sm text-white/50">
              Cancel
            </button>
            <button disabled={!isValid} onClick={() => onConfirm(deltaMins, newVal)}
              className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-30">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function FlightTimerModal({ onCancel, onConfirm, initialMins }) {
  const initDigits = () => {
    if (!initialMins) return ['', '', '', '']
    const hh = String(Math.floor(initialMins / 60)).padStart(2, '0')
    const mm  = String(initialMins % 60).padStart(2, '0')
    return [hh[0], hh[1], mm[0], mm[1]]
  }
  const [digits, setDigits] = useState(initDigits)
  const r0 = useRef(null); const r1 = useRef(null)
  const r2 = useRef(null); const r3 = useRef(null)
  const refs = [r0, r1, r2, r3]

  function handleChange(i, val) {
    const d = val.replace(/[^0-9]/g, '').slice(-1)
    const next = [...digits]; next[i] = d; setDigits(next)
    if (d && i < 3) setTimeout(() => refs[i + 1].current?.focus(), 0)
  }

  function handleKeyDown(i, e) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      refs[i - 1].current?.focus()
    }
  }

  const hh       = parseInt((digits[0] || '0') + (digits[1] || '0'), 10)
  const mm       = parseInt((digits[2] || '0') + (digits[3] || '0'), 10)
  const totalMins = hh * 60 + mm
  const hasInput  = digits.some(d => d !== '')
  const isValid   = hasInput && totalMins > 0 && mm < 60

  const digitBox = 'w-16 h-16 rounded-xl text-3xl font-bold text-white text-center tabular-nums ' +
    'bg-white/[0.06] focus:border-white/30 focus:bg-white/[0.09] ' +
    'outline-none transition-colors caret-white'

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/70" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
           style={{ background: '#0e0e10' }}>
        <div className="px-6 pt-6 pb-4" style={{ background: 'linear-gradient(160deg,#17171a,#111113)' }}>
          <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Flight Time</p>
          <p className="text-lg font-bold text-white">Timer</p>
        </div>
        <div className="px-6 pt-5 pb-6 space-y-4">
          <div className="flex items-center justify-center gap-2">
            <input ref={r0} type="text" inputMode="numeric" maxLength={1} value={digits[0]}
              onChange={e => handleChange(0, e.target.value)} onKeyDown={e => handleKeyDown(0, e)}
              autoFocus className={digitBox} />
            <input ref={r1} type="text" inputMode="numeric" maxLength={1} value={digits[1]}
              onChange={e => handleChange(1, e.target.value)} onKeyDown={e => handleKeyDown(1, e)}
              className={digitBox} />
            <span className="text-3xl font-bold text-white/30 px-1">:</span>
            <input ref={r2} type="text" inputMode="numeric" maxLength={1} value={digits[2]}
              onChange={e => handleChange(2, e.target.value)} onKeyDown={e => handleKeyDown(2, e)}
              className={digitBox} />
            <input ref={r3} type="text" inputMode="numeric" maxLength={1} value={digits[3]}
              onChange={e => handleChange(3, e.target.value)} onKeyDown={e => handleKeyDown(3, e)}
              className={digitBox} />
          </div>

          {isValid && (
            <div className="flex items-center justify-between bg-white/[0.05] rounded-xl px-4 py-3">
              <span className="text-xs text-white/40">Flight Time</span>
              <span className="text-sm font-bold text-white tabular-nums">{toHobbs(totalMins).toFixed(1)}h</span>
            </div>
          )}
          {hasInput && mm >= 60 && (
            <p className="text-xs text-red-400 text-center">Minutes must be 00–59</p>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl bg-white/[0.06] text-sm text-white/50">
              Cancel
            </button>
            <button disabled={!isValid} onClick={() => onConfirm(totalMins)}
              className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold text-black disabled:opacity-30">
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
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
        <div className="absolute right-0 top-full mt-1.5 z-50 rounded-2xl
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
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [adjustVal,  setAdjustVal]  = useState('')

  function handleToConfirm(toValue) {
    if (toValue && rawMins > 0 && leg.actual_minutes === null) {
      onLegComplete?.(index, rawMins, leg.takeoff_location, toValue, leg.takeoff_time, leg.landing_time)
    }
  }

  function openAdjust() {
    const current = leg.actual_minutes != null ? toHobbs(leg.actual_minutes) : toHobbs(rawMins)
    setAdjustVal(current.toFixed(1))
    setAdjustOpen(true)
  }

  function confirmAdjust() {
    const h = parseFloat(adjustVal)
    if (!isNaN(h) && h > 0) {
      const newMins = Math.round(h * 60)
      if (newMins > rawMins) return // cannot exceed calculated time
      onChange('actual_minutes', newMins)
    }
    setAdjustOpen(false)
  }

  function resetAdjust() {
    onChange('actual_minutes', null)
    onChange('wait_note', '')
    setAdjustOpen(false)
  }

  return (
    <div className="bg-white/[0.04] rounded-2xl p-4 space-y-3">
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
          <>
            <button
              onClick={openAdjust}
              className="w-full text-left rounded-xl bg-white/[0.04]
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
            </button>

            {/* Adjust mini modal */}
            {adjustOpen && (
              <div className="rounded-xl bg-white/[0.06] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">Adjust Air Time</p>
                  <span className="text-[10px] text-white/25">Calculated: {toHobbs(rawMins).toFixed(1)}h</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={adjustVal}
                    onChange={e => setAdjustVal(e.target.value.replace(/[^0-9.]/g, ''))}
                    autoFocus
                    className={`input-field w-full pr-8 text-lg font-bold tabular-nums ${parseFloat(adjustVal) * 60 > rawMins ? 'border-red-500/50 text-red-400' : ''}`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30 pointer-events-none">h</span>
                </div>
                {parseFloat(adjustVal) * 60 > rawMins && (
                  <p className="text-[11px] text-red-400">Cannot exceed calculated time ({toHobbs(rawMins).toFixed(1)}h)</p>
                )}
                <div className="flex gap-2">
                  {isAdjusted && (
                    <button onClick={resetAdjust}
                      className="flex-1 py-2.5 rounded-xl text-xs text-white/40
                                 active:bg-white/[0.07] transition-colors select-none">
                      Reset
                    </button>
                  )}
                  <button onClick={() => setAdjustOpen(false)}
                    className="flex-1 py-2.5 rounded-xl text-xs text-white/40
                               active:bg-white/[0.07] transition-colors select-none">
                    Cancel
                  </button>
                  <button onClick={confirmAdjust}
                    className="flex-1 py-2.5 rounded-xl bg-white text-black text-xs font-semibold
                               active:scale-[0.98] transition-transform select-none">
                    Confirm
                  </button>
                </div>
              </div>
            )}
          </>
        )
      })()}

      {(onAddLeg || onUseTach) && (
        <div className="flex gap-2 pt-1">
          {onAddLeg && (
            <button
              onClick={onAddLeg}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl
                         bg-white/[0.06] hover:bg-white/[0.10] active:bg-white/[0.10]
                        
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
      <div className="relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
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
          <div className=" border-t border-white/[0.05] my-4" />

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
                         text-sm text-white/50 hover:text-white/80 active:text-white/80
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
