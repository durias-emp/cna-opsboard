import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { softDelete } from '../lib/softDelete'
import ActionSheet from './ActionSheet'

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-CA', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const FILTERS = ['All', 'Today', 'This month']

// ── Check badge ────────────────────────────────────────────────────────────────

function CheckBadge({ label, checked }) {
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10px] font-semibold flex-shrink-0
      ${checked ? 'bg-white/10 text-white' : 'bg-white/[0.04] text-white/25'}`}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
        strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
        {checked
          ? <polyline points="20 6 9 17 4 12" />
          : <line x1="18" y1="6" x2="6" y2="18" />}
      </svg>
      {label}
    </div>
  )
}

// ── Detail item ────────────────────────────────────────────────────────────────

function DetailItem({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-0.5">{label}</p>
      <p className="text-xs font-semibold text-white">{value || '—'}</p>
    </div>
  )
}

// ── Itinerary record card ──────────────────────────────────────────────────────

function ItineraryCard({ record: r, isExpanded, onToggle, onEdit, onDelete }) {
  const pax = r.pax ?? []
  const totalWeight = pax.reduce((s, p) => s + (parseFloat(p.weight) || 0), 0)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)   // first tap asks, second tap deletes

  return (
    <div className="card p-0 overflow-hidden">
      {/* Summary row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.025] transition-colors select-none"
      >
        {/* Globe icon */}
        <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center flex-shrink-0 text-white/30">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
            strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            {r.departure_icao || '—'}
          </p>
          <p className="text-[11px] text-white/35 mt-0.5 truncate">
            {r.pilot_in_command} · {formatDate(r.date)}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Check dots */}
          <div className="flex gap-1">
            {r.daily_inspection && (
              <span className="w-1.5 h-1.5 rounded-full bg-white/50" />
            )}
            {r.weight_and_balance && (
              <span className="w-1.5 h-1.5 rounded-full bg-white/30" />
            )}
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round"
            className={`w-4 h-4 text-white/20 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </div>
      </button>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t border-white/[0.05] px-4 pt-3 pb-4 space-y-4">

          {/* Route */}
          <div>
            <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1">Route</p>
            <p className="text-sm font-semibold text-white">{r.departure_icao || '—'}</p>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <DetailItem label="Aircraft"      value={r.aircraft_type} />
            <DetailItem label="Registration"  value={r.registration} />
            <DetailItem label="Date"          value={formatDate(r.date)} />
            <DetailItem label="Dep. Time"     value={r.departure_time || '—'} />
            <DetailItem label="ETE"           value={r.ete || '—'} />
            <DetailItem label="Fuel on Board" value={r.fuel_on_board ? `${r.fuel_on_board} gal` : '—'} />
          </div>

          {/* Pre-flight check badges */}
          <div className="flex gap-2 flex-wrap">
            <CheckBadge label="Daily Inspection" checked={r.daily_inspection} />
            <CheckBadge label="Weight & Balance"  checked={r.weight_and_balance} />
          </div>

          {/* Passengers */}
          {pax.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-2">
                Passengers
              </p>
              <div className="space-y-1.5">
                {pax.map((p, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <p className="text-xs text-white/70">{p.name}</p>
                    <p className="text-xs text-white/40">{p.weight ? `${p.weight} lbs` : '—'}</p>
                  </div>
                ))}
                {totalWeight > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05]">
                    <p className="text-[10px] text-white/30">Total PAX weight</p>
                    <p className="text-xs font-semibold text-white/50">{totalWeight} lbs</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {r.additional_comments && (
            <div>
              <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest mb-1.5">
                Notes
              </p>
              <p className="text-xs text-white/60 leading-relaxed">{r.additional_comments}</p>
            </div>
          )}

          {/* Submitted timestamp */}
          <p className="text-[10px] text-white/20">
            Submitted {formatDateTime(r.submitted_at)}
          </p>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => onEdit(r)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold select-none
                bg-white/[0.07] text-white/35
                transition-all duration-200
                hover:bg-white hover:text-black
                active:bg-white active:text-black active:scale-[0.97]"
            >
              Edit
            </button>
            <button
              disabled={deleting}
              onClick={() => setConfirmDelete(true)}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold select-none transition-all duration-200
                active:scale-[0.97] disabled:opacity-40
                bg-white/[0.07] text-white/35 hover:bg-red-500/20 hover:text-red-300"
            >
              {deleting ? 'Deleting…' : 'Delete'}
            </button>
            <ActionSheet
              open={confirmDelete}
              onClose={() => setConfirmDelete(false)}
              title="Delete this passenger manifest? The office can restore it if needed."
              actions={[{ label: 'Delete Manifest', destructive: true, onPress: async () => {
                setDeleting(true); await onDelete(r.id); setDeleting(false)
              } }]}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main drawer ────────────────────────────────────────────────────────────────

export default function ItineraryRecordsDrawer({ open, onClose, onEdit }) {
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  const [records,      setRecords]      = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const [activeFilter, setActiveFilter] = useState(0)
  const [expanded,     setExpanded]     = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('flight_itineraries')
      .select('*')
      .order('date',         { ascending: false })
      .order('submitted_at', { ascending: false })
    if (data) setRecords(data.filter(r => !r.deleted_at))   // hide soft-deleted manifests
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!open) return
    load()
    setSearch('')
    setActiveFilter(0)
    setExpanded(null)
  }, [open, load])

  // Date helpers (local timezone)
  const now = new Date()
  const _ld = d =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const todayStr   = _ld(now)
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const filtered = records.filter(r => {
    if (activeFilter === 1 && r.date !== todayStr)   return false
    if (activeFilter === 2 && r.date < monthStart)   return false
    if (search) {
      const q = search.toLowerCase()
      return (
        (r.pilot_in_command  ?? '').toLowerCase().includes(q) ||
        (r.departure_icao    ?? '').toLowerCase().includes(q) ||
        (r.destination_icao  ?? '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <>
      {/* Overlay */}
      <div
        className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel — full-height sheet */}
      <div
        className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '96dvh', ...panelStyle }}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-10 h-1 rounded-full bg-white/10" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-1 pb-3 border-b border-white/[0.06] flex-shrink-0">
          <div>
            <p className="text-base font-bold text-white">Itinerary Records</p>
            <p className="text-[11px] text-white/35 mt-0.5">
              {loading ? '…' : `${records.length} total`}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/40 active:bg-white/10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="w-4 h-4">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Search + filters */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0 space-y-2.5">
          <div className="relative">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
              strokeLinecap="round" strokeLinejoin="round"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25 pointer-events-none">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search pilot, departure, destination…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field w-full pl-9 py-2.5 text-sm"
            />
          </div>

          <div className="flex gap-2">
            {FILTERS.map((f, i) => (
              <button
                key={f}
                onClick={() => setActiveFilter(i)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium border transition-colors select-none
                  ${i === activeFilter
                    ? 'bg-white/10 text-white border-white/15'
                    : 'bg-transparent text-white/35 border-white/[0.07]'}`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Records list */}
        <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 space-y-2.5">
          {loading ? (
            [1, 2, 3].map(i => (
              <div key={i} className="card animate-pulse h-16" />
            ))
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center text-white/15">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
                  strokeLinecap="round" className="w-5 h-5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="2" y1="12" x2="22" y2="12" />
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                </svg>
              </div>
              <p className="text-xs text-white/25">
                {search ? 'No results for that search' : 'No itineraries submitted yet'}
              </p>
            </div>
          ) : (
            filtered.map(r => (
              <ItineraryCard
                key={r.id}
                record={r}
                isExpanded={expanded === r.id}
                onToggle={() => setExpanded(prev => prev === r.id ? null : r.id)}
                onEdit={onEdit}
                onDelete={async (id) => {
                  const { error } = await softDelete('flight_itineraries', id)
                  if (error) { alert(`Could not delete: ${error.message}`); return }
                  setRecords(prev => prev.filter(x => x.id !== id))
                  setExpanded(null)
                }}
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}
