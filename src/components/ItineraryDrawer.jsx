import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import DatePicker from './DatePicker'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { useAircraft } from '../context/AircraftContext'
import { useTeam } from '../context/TeamContext'

// ── Phone input with country code ─────────────────────────────────────────────

const DIAL_CODES = [
  // ── Latin America & Caribbean (prioritised) ──────────────────────────────────
  { iso: 'sv', code: '+503',  country: 'El Salvador'       },
  { iso: 'gt', code: '+502',  country: 'Guatemala'         },
  { iso: 'hn', code: '+504',  country: 'Honduras'          },
  { iso: 'ni', code: '+505',  country: 'Nicaragua'         },
  { iso: 'cr', code: '+506',  country: 'Costa Rica'        },
  { iso: 'pa', code: '+507',  country: 'Panama'            },
  { iso: 'mx', code: '+52',   country: 'Mexico'            },
  { iso: 'co', code: '+57',   country: 'Colombia'          },
  { iso: 've', code: '+58',   country: 'Venezuela'         },
  { iso: 'ec', code: '+593',  country: 'Ecuador'           },
  { iso: 'pe', code: '+51',   country: 'Peru'              },
  { iso: 'bo', code: '+591',  country: 'Bolivia'           },
  { iso: 'cl', code: '+56',   country: 'Chile'             },
  { iso: 'ar', code: '+54',   country: 'Argentina'         },
  { iso: 'uy', code: '+598',  country: 'Uruguay'           },
  { iso: 'py', code: '+595',  country: 'Paraguay'          },
  { iso: 'br', code: '+55',   country: 'Brazil'            },
  { iso: 'do', code: '+1809', country: 'Dominican Rep.'    },
  { iso: 'cu', code: '+53',   country: 'Cuba'              },
  { iso: 'ht', code: '+509',  country: 'Haiti'             },
  { iso: 'jm', code: '+1876', country: 'Jamaica'           },
  { iso: 'tt', code: '+1868', country: 'Trinidad & Tobago' },
  { iso: 'bb', code: '+1246', country: 'Barbados'          },
  { iso: 'bz', code: '+501',  country: 'Belize'            },
  { iso: 'gy', code: '+592',  country: 'Guyana'            },
  { iso: 'sr', code: '+597',  country: 'Suriname'          },
  // ── North America ────────────────────────────────────────────────────────────
  { iso: 'us', code: '+1',    country: 'USA / Canada'      },
  // ── Europe ───────────────────────────────────────────────────────────────────
  { iso: 'es', code: '+34',   country: 'Spain'             },
  { iso: 'gb', code: '+44',   country: 'United Kingdom'    },
  { iso: 'fr', code: '+33',   country: 'France'            },
  { iso: 'de', code: '+49',   country: 'Germany'           },
  { iso: 'it', code: '+39',   country: 'Italy'             },
  { iso: 'pt', code: '+351',  country: 'Portugal'          },
  { iso: 'nl', code: '+31',   country: 'Netherlands'       },
  { iso: 'be', code: '+32',   country: 'Belgium'           },
  { iso: 'ch', code: '+41',   country: 'Switzerland'       },
  { iso: 'at', code: '+43',   country: 'Austria'           },
  { iso: 'se', code: '+46',   country: 'Sweden'            },
  { iso: 'no', code: '+47',   country: 'Norway'            },
  { iso: 'dk', code: '+45',   country: 'Denmark'           },
  { iso: 'fi', code: '+358',  country: 'Finland'           },
  { iso: 'pl', code: '+48',   country: 'Poland'            },
  { iso: 'ru', code: '+7',    country: 'Russia'            },
  // ── Middle East ──────────────────────────────────────────────────────────────
  { iso: 'ae', code: '+971',  country: 'UAE'               },
  { iso: 'sa', code: '+966',  country: 'Saudi Arabia'      },
  { iso: 'il', code: '+972',  country: 'Israel'            },
  { iso: 'tr', code: '+90',   country: 'Turkey'            },
  // ── Asia & Oceania ───────────────────────────────────────────────────────────
  { iso: 'cn', code: '+86',   country: 'China'             },
  { iso: 'jp', code: '+81',   country: 'Japan'             },
  { iso: 'kr', code: '+82',   country: 'South Korea'       },
  { iso: 'in', code: '+91',   country: 'India'             },
  { iso: 'au', code: '+61',   country: 'Australia'         },
  { iso: 'nz', code: '+64',   country: 'New Zealand'       },
  // ── Africa ───────────────────────────────────────────────────────────────────
  { iso: 'za', code: '+27',   country: 'South Africa'      },
  { iso: 'ng', code: '+234',  country: 'Nigeria'           },
  { iso: 'ke', code: '+254',  country: 'Kenya'             },
  { iso: 'eg', code: '+20',   country: 'Egypt'             },
]

function FlagImg({ iso, className = 'w-5 h-3.5' }) {
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      alt={iso}
      className={`${className} object-cover rounded-[2px]`}
    />
  )
}

const DROPDOWN_STYLE = {
  background: '#1c1c1e',
  border: '1px solid rgba(255,255,255,0.08)',
  maxHeight: 220,
  overflowY: 'auto',
  WebkitOverflowScrolling: 'touch',
}

function CountryOption({ d, active, onSelect }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onSelect(d) }}
      className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left transition-colors active:bg-white/[0.07]"
      style={{ background: active ? 'rgba(255,255,255,0.06)' : 'transparent' }}
    >
      <FlagImg iso={d.iso} />
      <span className="text-xs text-white/80 flex-1">{d.country}</span>
      <span className="text-xs text-white/35 font-medium">{d.code}</span>
    </button>
  )
}

function PhoneInput({ value, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false)  // flag-button picker
  const [codeQuery,  setCodeQuery]  = useState('')     // "+" typed in number field
  const ref      = useRef(null)
  const inputRef = useRef(null)

  const dial_code = value?.dial_code ?? '+503'
  const number    = value?.number    ?? ''
  const selected  = DIAL_CODES.find(d => d.code === dial_code) ?? DIAL_CODES[0]

  const isCodeSearch = codeQuery.length > 0
  const codeResults  = isCodeSearch
    ? DIAL_CODES.filter(d =>
        d.code.startsWith(codeQuery) ||
        d.country.toLowerCase().includes(codeQuery.replace(/^\+/, '').toLowerCase())
      )
    : []

  // Close both dropdowns on outside click
  useEffect(() => {
    if (!pickerOpen && !isCodeSearch) return
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setPickerOpen(false)
        setCodeQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [pickerOpen, isCodeSearch])

  function handleNumberChange(e) {
    const val = e.target.value
    if (val.startsWith('+')) {
      // User is typing a code — enter search mode, don't propagate to number
      setCodeQuery(val)
      setPickerOpen(false)
    } else {
      setCodeQuery('')
      onChange({ dial_code, number: val })
    }
  }

  function selectCountry(d) {
    onChange({ dial_code: d.code, number: '' })
    setPickerOpen(false)
    setCodeQuery('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <div ref={ref} className="relative flex rounded-xl overflow-visible"
         style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>

      {/* Country code button */}
      <button
        type="button"
        onClick={() => { setPickerOpen(o => !o); setCodeQuery('') }}
        className="flex items-center gap-1.5 pl-3 pr-2.5 py-2.5 flex-shrink-0 transition-colors active:bg-white/[0.04]"
        style={{ borderRight: '1px solid rgba(255,255,255,0.08)' }}
      >
        <FlagImg iso={selected.iso} />
        <span className="text-xs font-medium text-white/60">{selected.code}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          strokeLinecap="round" className="w-2.5 h-2.5 text-white/25">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {/* Number input — doubles as code search when user types "+" */}
      <input
        ref={inputRef}
        type="tel"
        inputMode="tel"
        placeholder="Phone number"
        value={isCodeSearch ? codeQuery : number}
        onChange={handleNumberChange}
        className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-white outline-none"
        style={{ caretColor: 'white' }}
      />

      {/* Flag-button picker */}
      {pickerOpen && (
        <div className="absolute left-0 top-full mt-1 z-[60] w-56 rounded-xl shadow-2xl" style={DROPDOWN_STYLE}>
          {DIAL_CODES.map(d => (
            <CountryOption key={d.iso} d={d} active={d.code === dial_code} onSelect={selectCountry} />
          ))}
        </div>
      )}

      {/* Code-search results (triggered by typing "+" in number field) */}
      {isCodeSearch && codeResults.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-[60] w-56 rounded-xl shadow-2xl" style={DROPDOWN_STYLE}>
          {codeResults.map(d => (
            <CountryOption key={d.iso} d={d} active={d.code === dial_code} onSelect={selectCountry} />
          ))}
        </div>
      )}
    </div>
  )
}

const FREQUENT_PAX = [
  { name: 'Francisco Cordova', weight: 150 },
  { name: 'Westley Cordova',   weight: 180 },
]


function todayLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const EMPTY = () => ({
  pilot_in_command:   '',
  copilot:            '',
  date:               todayLocal(),
  daily_inspection:   false,
  weight_and_balance: false,
  route:              '',
  notes:              '',
  departure_time:     '',
  ete:                '',
  fuel_on_board:      '',
  signature:          null,
  pax: [
    { name: '', weight: '', email: '', emergency_contact: { dial_code: '+503', number: '' } },
    { name: '', weight: '', email: '', emergency_contact: { dial_code: '+503', number: '' } },
    { name: '', weight: '', email: '', emergency_contact: { dial_code: '+503', number: '' } },
    { name: '', weight: '', email: '', emergency_contact: { dial_code: '+503', number: '' } },
  ],
})

// ── Signature pad ─────────────────────────────────────────────────────────────

function SignaturePad({ onChange }) {
  const canvasRef = useRef(null)
  const drawing   = useRef(false)
  const last      = useRef({ x: 0, y: 0 })
  const [isEmpty, setIsEmpty] = useState(true)

  // Size canvas intrinsic width to its rendered width on mount
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = canvas.offsetWidth || 300
    canvas.height = 160
  }, [])

  function getCtx() {
    const c = canvasRef.current.getContext('2d')
    c.strokeStyle = 'rgba(255,255,255,0.88)'
    c.fillStyle   = 'rgba(255,255,255,0.88)'
    c.lineWidth   = 2.4
    c.lineCap     = 'round'
    c.lineJoin    = 'round'
    return c
  }

  function xy(e) {
    const rect = canvasRef.current.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function onPointerDown(e) {
    e.preventDefault()
    const canvas = canvasRef.current
    // Re-size on first press if offsetWidth was 0 at mount (drawer animating in)
    if (canvas.offsetWidth > 0 && canvas.width !== canvas.offsetWidth) {
      canvas.width  = canvas.offsetWidth
      canvas.height = 160
    }
    // Capture all subsequent pointer events to this canvas, even if pointer leaves
    canvas.setPointerCapture(e.pointerId)
    drawing.current = true
    const pos = xy(e)
    last.current = pos
    setIsEmpty(false)
    // Paint a dot so single taps are visible
    const c = getCtx()
    c.beginPath()
    c.arc(pos.x, pos.y, 1.2, 0, Math.PI * 2)
    c.fill()
  }

  function onPointerMove(e) {
    if (!drawing.current) return
    const pos = xy(e)
    const c   = getCtx()
    c.beginPath()
    c.moveTo(last.current.x, last.current.y)
    c.lineTo(pos.x, pos.y)
    c.stroke()
    last.current = pos
  }

  function onPointerUp() {
    if (!drawing.current) return
    drawing.current = false
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  function clear() {
    drawing.current = false
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
    onChange(null)
  }

  return (
    <div className="relative rounded-2xl overflow-hidden"
         style={{ background: 'rgba(0,0,0,0.22)', border: '1px dashed rgba(255,255,255,0.10)' }}>
      <canvas
        ref={canvasRef}
        height={160}
        style={{ display: 'block', width: '100%', height: 160, touchAction: 'none', cursor: 'crosshair' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      {isEmpty && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none gap-2">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}
            strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-white/15">
            <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
          </svg>
          <p className="text-[11px] text-white/20 tracking-wide">Sign here</p>
        </div>
      )}
      {!isEmpty && (
        <button
          type="button"
          onPointerDown={e => { e.stopPropagation(); clear() }}
          className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold
                     text-white/30 bg-white/[0.06] active:bg-white/[0.12] select-none transition-colors"
        >
          Clear
        </button>
      )}
    </div>
  )
}

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
  const { selectedAircraft } = useAircraft()
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)
  const [form,          setForm]         = useState(EMPTY())
  const [saving,        setSaving]       = useState(false)
  const [success,       setSuccess]      = useState(false)
  const [errors,        setErrors]       = useState({})
  const [paxDropdown,   setPaxDropdown]  = useState(null) // index of open dropdown
  const dropdownRef = useRef(null)

  const pilots = useTeam().pilots.map(p => ({ id: p.name, name: p.name }))

  // Reset / pre-fill form whenever drawer opens
  useEffect(() => {
    if (!open) return
    if (editRecord) {
      const srcPax = editRecord.pax ?? []
      const filled = srcPax.map(p => ({
        name:  p.name   ?? '',
        weight: p.weight != null ? String(p.weight) : '',
        email: p.email ?? '',
        // support both old string format and new object format
        emergency_contact: typeof p.emergency_contact === 'object' && p.emergency_contact !== null
          ? p.emergency_contact
          : { dial_code: '+503', number: p.emergency_contact ?? '' },
      }))
      while (filled.length < 4) filled.push({ name: '', weight: '', email: '', emergency_contact: { dial_code: '+503', number: '' } })
      setForm({
        pilot_in_command:   editRecord.pilot_in_command   ?? '',
        copilot:            editRecord.copilot            ?? '',
        date:               editRecord.date               ?? todayLocal(),
        daily_inspection:   editRecord.daily_inspection   ?? false,
        weight_and_balance: editRecord.weight_and_balance ?? false,
        route:              editRecord.departure_icao     ?? '',
        notes:              editRecord.additional_comments ?? '',
        departure_time:     editRecord.departure_time     ?? '',
        ete:                editRecord.ete                ?? '',
        fuel_on_board:      editRecord.fuel_on_board != null ? String(editRecord.fuel_on_board) : '',
        signature:          editRecord.signature_data ?? null,
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
    if (form.pax[0].name.trim() && !form.pax[0].email.trim()) e.pax0email = 'Required'
    if (!form.date) e.date = 'Required'
    if (form.fuel_on_board && !(Number.isFinite(parseFloat(form.fuel_on_board)) && parseFloat(form.fuel_on_board) >= 0)) e.fuel = 'Must be a number'
    return e
  }

  async function handleSave() {
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }

    setSaving(true)
    const payload = {
      aircraft_type:       selectedAircraft?.make_model  ?? null,
      registration:        selectedAircraft?.tail_number ?? null,
      pilot_in_command:    form.pilot_in_command,
      copilot:             form.copilot || null,
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
      signature_data:      form.signature      || null,
    }

    const { error } = editRecord
      ? await supabase.from('flight_itineraries').update(payload).eq('id', editRecord.id)
      : await supabase.from('flight_itineraries').insert([payload])
    setSaving(false)

    if (error) { setErrors({ _: error.message }); return }

    // Email is now sent via Supabase DB webhook on INSERT — no client call needed

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
            <p className="text-[11px] text-white/35 mt-0.5">{selectedAircraft?.tail_number} · {selectedAircraft?.make_model}</p>
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

            {/* Co-Pilot */}
            {!form.copilot ? (
              <button
                type="button"
                onClick={() => set('copilot', pilots.find(p => p.name !== form.pilot_in_command)?.name ?? pilots[0]?.name ?? '')}
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
                  <p className="text-[11px] text-white/40">Co-Pilot</p>
                  <button
                    type="button"
                    onClick={() => set('copilot', '')}
                    className="text-[11px] text-white/30 hover:text-white/60 transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <div className="relative">
                  <select
                    value={form.copilot}
                    onChange={e => set('copilot', e.target.value)}
                    className="input-field w-full pr-10 text-white"
                    style={{ WebkitAppearance: 'none', appearance: 'none', background: 'rgba(255,255,255,0.06)' }}
                  >
                    {pilots.filter(p => p.name !== form.pilot_in_command).map(p => (
                      <option key={p.id} value={p.name} style={{ background: '#111827', color: 'white' }}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-white/30">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      strokeLinecap="round" className="w-4 h-4">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* Date */}
            <div>
              <p className="text-[11px] text-white/40 mb-1.5">
                Date{errors.date && <span className="ml-1.5 text-white/50">— {errors.date}</span>}
              </p>
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
              <p className="text-[11px] text-white/40 mb-1.5">
                Fuel on Board at Departure{errors.fuel && <span className="ml-1.5 text-white/50">— {errors.fuel}</span>}
              </p>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.0"
                  value={form.fuel_on_board}
                  onChange={e => set('fuel_on_board', e.target.value)}
                  className={`input-field w-full pr-16 ${errors.fuel ? 'border-white/30' : ''}`}
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
                <div key={i} className="space-y-1.5">
                <div className="flex items-center gap-2">
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

                {/* Emergency contact — appears when name is typed */}
                {p.name.trim() && (
                  <div className="ml-8 space-y-1.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-1 ml-1">
                        Emergency Contact Number
                      </label>
                      <PhoneInput
                        value={p.emergency_contact}
                        onChange={val => setPax(i, 'emergency_contact', val)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-white/25 uppercase tracking-wider mb-1 ml-1">
                        {i === 0 && errors.pax0email
                          ? <span>Email — <span className="text-white/50">{errors.pax0email}</span></span>
                          : 'Email'}
                      </label>
                      <input
                        type="email"
                        inputMode="email"
                        placeholder="email@example.com"
                        value={p.email}
                        onChange={e => {
                          setPax(i, 'email', e.target.value)
                          if (i === 0) setErrors(err => ({ ...err, pax0email: undefined }))
                        }}
                        className={`input-field w-full ${i === 0 && errors.pax0email ? 'border-white/30' : ''}`}
                      />
                    </div>
                  </div>
                )}
                </div>
              ))}
            </div>
          </div>

          {/* ── Customer Acknowledgement ── */}
          <div className="card space-y-3">
            <div>
              <p className="label">Customer Acknowledgement</p>
              <p className="text-[11px] text-white/30 mt-0.5">
                By signing, the customer confirms they have read and agreed to the flight conditions.
              </p>
            </div>
            <SignaturePad onChange={sig => set('signature', sig)} />
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
