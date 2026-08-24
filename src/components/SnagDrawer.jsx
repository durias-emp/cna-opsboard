import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAircraft } from '../context/AircraftContext'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { useTeam } from '../context/TeamContext'

// ── Bell 206B3 JetRanger maintenance categories ───────────────────────────────
const MAINTENANCE_TYPES = [
  'Airframe / Structure',
  'Engine (Allison 250-C20J)',
  'Main Rotor System',
  'Tail Rotor System',
  'Transmission / Drive System',
  'Electrical System',
  'Avionics / Instruments',
  'Fuel System',
  'Hydraulic System',
  'Landing Gear / Skids',
  'Flight Controls',
  'Cabin / Interior',
  'Other',
]


const DESCRIPTION_PLACEHOLDER =
  `Describe the snag in detail:\n• What happened\n• When it happened\n• Under what conditions (flight phase, time of day, etc.)\n• Whether it is intermittent or constant\n\nExample: "Landing light inoperative during night operation. Circuit breaker checked — normal position. Condition appeared on departure, constant throughout flight."`

// ── Helpers ───────────────────────────────────────────────────────────────────
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function SnagDrawer({ open, onClose, onSaved }) {
  const team = useTeam()
  const PILOT_NAMES = team.pilots.map(p => p.name)
  const MECH_NAMES  = team.mechanics.map(p => p.name)
  const OPS_NAMES   = team.operations.map(p => p.name)
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const { selectedAircraft } = useAircraft()

  const [date,        setDate]        = useState('')
  const [reportedBy,  setReportedBy]  = useState('')
  const [assignedTo,  setAssignedTo]  = useState('')
  const [maintType,   setMaintType]   = useState('')
  const [description, setDescription] = useState('')
  const [hours,       setHours]       = useState('')
  const [cycles,      setCycles]      = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)

  // Reset form whenever drawer opens
  useEffect(() => {
    if (open) {
      setDate(today())
      setReportedBy('')
      setAssignedTo('')
      setMaintType('')
      setDescription('')
      setHours(selectedAircraft?.hobbs_current?.toString() ?? '')
      setCycles(selectedAircraft?.cycles_current?.toString() ?? '')
      setError(null)
    }
  }, [open, selectedAircraft])

  // Lock body scroll while open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleSave() {
    if (!selectedAircraft) return

    const hoursNum  = parseFloat(hours)
    const cyclesNum = parseInt(cycles, 10)

    if (!date)        { setError('Date is required.');                  return }
    if (!reportedBy)  { setError('Please select who is reporting.');     return }
    if (!maintType)   { setError('Please select a maintenance type.');   return }
    if (!description.trim() || description.trim().length < 20) {
      setError('Description is too short — please provide full details.'); return
    }
    if (isNaN(hoursNum))  { setError('Aircraft hours must be a valid number.'); return }
    if (isNaN(cyclesNum)) { setError('Aircraft cycles must be a valid number.'); return }

    setError(null)
    setSaving(true)

    const { error: err } = await supabase.from('snags').insert({
      aircraft_id:      selectedAircraft.id,
      date,
      reported_by:      reportedBy,
      assigned_to:      assignedTo || null,
      maintenance_type: maintType,
      description:      description.trim(),
      aircraft_hours:   hoursNum,
      aircraft_cycles:  cyclesNum,
      status:           'open',
    })

    setSaving(false)

    if (err) { setError(err.message); return }
    onSaved?.()
    onClose()
  }

  const isValid = date && reportedBy && maintType && description.trim().length >= 20
    && !isNaN(parseFloat(hours)) && !isNaN(parseInt(cycles, 10))

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
            <h2 className="text-lg font-bold text-white">Report Snag</h2>
            <p className="text-xs text-white/35 mt-0.5">
              {selectedAircraft?.tail_number} · {selectedAircraft?.hobbs_current?.toLocaleString()}h · {selectedAircraft?.cycles_current?.toLocaleString()} cyc
            </p>
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

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-2">

          {/* Date */}
          <div>
            <label className="label block mb-1.5">Date</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {/* Reported By */}
          <div>
            <label className="label block mb-1.5">Reported By</label>
            <div className="relative">
              <select
                value={reportedBy}
                onChange={e => setReportedBy(e.target.value)}
                className="input-field w-full appearance-none pr-8"
                style={{ color: reportedBy ? 'white' : 'rgba(255,255,255,0.25)' }}
              >
                <option value="" disabled>Select person</option>
                <optgroup label="Pilots">
                  {PILOT_NAMES.map(name => (
                    <option key={name} value={name} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{name}</option>
                  ))}
                </optgroup>
                <optgroup label="Mechanics">
                  {MECH_NAMES.map(name => (
                    <option key={name} value={name} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{name}</option>
                  ))}
                </optgroup>
                <optgroup label="Operations">
                  {OPS_NAMES.map(name => (
                    <option key={name} value={name} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{name}</option>
                  ))}
                </optgroup>
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* Assign To */}
          <div>
            <label className="label block mb-1.5">
              Assign To <span className="normal-case font-normal text-white/25">(optional)</span>
            </label>
            <div className="relative">
              <select
                value={assignedTo}
                onChange={e => setAssignedTo(e.target.value)}
                className="input-field w-full appearance-none pr-8"
                style={{ color: assignedTo ? 'white' : 'rgba(255,255,255,0.25)' }}
              >
                <option value="">Unassigned</option>
                {MECH_NAMES.map(name => (
                  <option key={name} value={name} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{name}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* Maintenance Type */}
          <div>
            <label className="label block mb-1.5">Maintenance Type</label>
            <div className="relative">
              <select
                value={maintType}
                onChange={e => setMaintType(e.target.value)}
                className="input-field w-full appearance-none pr-8"
                style={{ color: maintType ? 'white' : 'rgba(255,255,255,0.25)' }}
              >
                <option value="" disabled>Select type</option>
                {MAINTENANCE_TYPES.map(t => (
                  <option key={t} value={t} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{t}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label block mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={6}
              placeholder={DESCRIPTION_PLACEHOLDER}
              className="input-field w-full resize-none leading-relaxed"
            />
            {description.trim().length > 0 && description.trim().length < 20 && (
              <p className="text-[11px] text-white/30 mt-1">
                Add more detail — good snag reports prevent missed findings.
              </p>
            )}
          </div>

          {/* Aircraft Hours / Cycles — side by side */}
          <div>
            <label className="label block mb-1.5">Aircraft at time of snag</label>
            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input
                  type="number"
                  value={hours}
                  onChange={e => setHours(e.target.value)}
                  step="0.1" min="0"
                  className="input-field w-full pr-7"
                  placeholder="17502.8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">h</span>
              </div>
              <div className="relative">
                <input
                  type="number"
                  value={cycles}
                  onChange={e => setCycles(e.target.value)}
                  step="1" min="0"
                  className="input-field w-full pr-10"
                  placeholder="25816"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">cyc</span>
              </div>
            </div>
            <p className="text-[11px] text-white/25 mt-1.5">
              Auto-filled from current aircraft data — adjust if the snag occurred at a different time.
            </p>
          </div>

        </div>

        {/* Error */}
        {error && (
          <p className="px-5 pt-2 pb-1 text-xs text-red-400 flex-shrink-0">{error}</p>
        )}

        {/* Footer */}
        <div
          className="flex-shrink-0 border-t border-white/[0.05] px-5 pt-4"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={handleSave}
            disabled={saving || !isValid}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm
                       flex items-center justify-center gap-2
                       active:scale-[0.98] transition-transform disabled:opacity-40"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Saving…
              </>
            ) : 'Submit Snag Report'}
          </button>
        </div>

      </div>
    </>
  )
}
