import { useEffect, useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { supabase } from '../lib/supabase'
import { FLUID_TYPES } from '../hooks/useMaintenance'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'

const TYPES = [
  { key: 'engine_oil',       label: 'Engine Oil',       hasQuarts: true  },
  { key: 'transmission_oil', label: 'Trans. Oil',        hasQuarts: true  },
  { key: 'hydraulic_fluid',  label: 'Hydraulic',         hasQuarts: true  },
  { key: 'grease',           label: 'Grease',            hasQuarts: false },
]

export default function MaintenanceDrawer({ open, onClose, onSaved, defaultType }) {
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const { selectedAircraft } = useAircraft()

  const [activeType, setActiveType] = useState(defaultType ?? 'engine_oil')
  const [date,   setDate]   = useState('')
  const [hobbs,  setHobbs]  = useState('')
  const [quarts, setQuarts] = useState('')
  const [notes,  setNotes]  = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const currentType = TYPES.find(t => t.key === activeType)

  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      const _d = new Date()
      setDate(`${_d.getFullYear()}-${String(_d.getMonth() + 1).padStart(2, '0')}-${String(_d.getDate()).padStart(2, '0')}`)
      setHobbs(selectedAircraft?.hobbs_current?.toString() ?? '')
      setQuarts('')
      setNotes('')
      setError(null)
      if (defaultType) setActiveType(defaultType)
    }
  }, [open, selectedAircraft, defaultType])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleSave() {
    if (!selectedAircraft) return
    const hobbsNum = parseFloat(hobbs)
    if (!date || isNaN(hobbsNum)) { setError('Date and Air Time are required.'); return }
    if (currentType.hasQuarts && (!quarts || isNaN(parseFloat(quarts)))) {
      setError('Please enter the quantity in quarts.'); return
    }
    setError(null)
    setSaving(true)

    let err
    if (activeType === 'grease') {
      ;({ error: err } = await supabase.from('grease_logs').insert({
        aircraft_id:      selectedAircraft.id,
        date,
        hobbs_at_service: hobbsNum,
        notes:            notes || null,
      }))
    } else {
      ;({ error: err } = await supabase.from('fluid_logs').insert({
        aircraft_id:      selectedAircraft.id,
        fluid_type:       activeType,
        date,
        hobbs_at_service: hobbsNum,
        quantity_quarts:  parseFloat(quarts),
        notes:            notes || null,
      }))
    }

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
            <h2 className="text-lg font-bold text-white">Log Service</h2>
            <p className="text-xs text-white/35 mt-0.5">
              {selectedAircraft?.tail_number} · Air Time {selectedAircraft?.hobbs_current?.toLocaleString()}h
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

        {/* Type selector */}
        <div className="flex gap-2 px-5 pb-4 flex-shrink-0 overflow-x-auto">
          {TYPES.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveType(t.key)}
              className={`flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold
                          border transition-colors select-none
                          ${activeType === t.key
                            ? 'bg-white text-black border-white'
                            : 'bg-transparent text-white/40 border-white/10'}`}
            >
              {t.label}
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

          {/* Hobbs */}
          <div>
            <label className="label block mb-1.5">Air Time at service</label>
            <div className="relative">
              <input type="number" value={hobbs} onChange={e => setHobbs(e.target.value)}
                step="0.1" min="0"
                className="input-field w-full pr-8" placeholder="17000.0" />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30">h</span>
            </div>
          </div>

          {/* Quarts — hidden for grease */}
          {currentType.hasQuarts && (
            <div>
              <label className="label block mb-1.5">Quantity added</label>
              <div className="relative">
                <input type="number" value={quarts} onChange={e => setQuarts(e.target.value)}
                  step="0.25" min="0.25"
                  className="input-field w-full pr-10" placeholder="0.50" />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-white/30">qt</span>
              </div>
              {/* Quick-pick quart values */}
              <div className="flex gap-2 mt-2">
                {['0.25', '0.50', '0.75', '1.00'].map(v => (
                  <button key={v} onClick={() => setQuarts(v)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-medium border transition-colors
                      ${quarts === v
                        ? 'bg-white text-black border-white'
                        : 'bg-white/5 text-white/40 border-white/[0.06]'}`}>
                    {v} qt
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="label block mb-1.5">Notes <span className="normal-case font-normal text-white/25">(optional)</span></label>
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
          <button onClick={handleSave} disabled={saving}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm
                       flex items-center justify-center gap-2
                       active:scale-[0.98] transition-transform disabled:opacity-40">
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                Saving…
              </>
            ) : `Log ${currentType.label}`}
          </button>
        </div>
      </div>
    </>
  )
}
