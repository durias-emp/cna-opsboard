import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import { useAircraft } from '../context/AircraftContext'
import { useSnags } from '../hooks/useSnags'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { useTeam } from '../context/TeamContext'
import SnagDrawer from './SnagDrawer'


// ── Status config ─────────────────────────────────────────────────────────────
const STATUS = {
  open:        { label: 'Open',        dot: 'bg-red-400',    text: 'text-red-400'    },
  in_progress: { label: 'In Progress', dot: 'bg-yellow-400', text: 'text-yellow-400' },
  resolved:    { label: 'Resolved',    dot: 'bg-green-400',  text: 'text-green-400'  },
}

// ── Snag detail / resolve panel ───────────────────────────────────────────────
function SnagDetail({ snag, onClose, onUpdated }) {
  const RESOLVERS = useTeam().mechanics.map(p => p.name)
  const [resolvedBy,    setResolvedBy]    = useState(snag.resolved_by    ?? '')
  const [resolvedDate,  setResolvedDate]  = useState(snag.resolved_date  ?? '')
  const [resNotes,      setResNotes]      = useState(snag.resolution_notes ?? '')
  const [resolvedHours, setResolvedHours] = useState(snag.resolved_hours?.toString() ?? '')
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState(null)

  const isResolved = snag.status === 'resolved'

  async function handleResolve() {
    if (!resolvedBy)   { setError('Please select who resolved this snag.'); return }
    if (!resolvedDate) { setError('Resolved date is required.'); return }
    if (!resNotes.trim() || resNotes.trim().length < 10) {
      setError('Please describe what action was taken.'); return
    }
    setError(null)
    setSaving(true)
    const resolvedHoursNum = resolvedHours ? parseFloat(resolvedHours) : null
    if (resolvedHours && !(Number.isFinite(resolvedHoursNum) && resolvedHoursNum >= 0)) {
      setSaving(false); setError('Aircraft hours must be a number'); return
    }

    const { error: err } = await supabase
      .from('snags')
      .update({
        status:           'resolved',
        resolved_by:      resolvedBy,
        resolved_date:    resolvedDate,
        resolution_notes: resNotes.trim(),
        resolved_hours:   resolvedHoursNum,
      })
      .eq('id', snag.id)

    setSaving(false)
    if (err) { setError(err.message); return }
    onUpdated()
    onClose()
  }

  async function handleMarkInProgress() {
    await supabase.from('snags').update({ status: 'in_progress' }).eq('id', snag.id)
    onUpdated()
    onClose()
  }

  return (
    <div className="flex flex-col h-full">

      {/* Back button */}
      <button
        onClick={onClose}
        className="flex items-center gap-1.5 text-white/40 text-xs px-5 py-3 flex-shrink-0"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
          strokeLinecap="round" className="w-3.5 h-3.5">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to list
      </button>

      <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">

        {/* Status badge + type */}
        <div className="flex items-center gap-2">
          <span className={`flex items-center gap-1.5 text-[11px] font-semibold ${STATUS[snag.status].text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS[snag.status].dot}`} />
            {STATUS[snag.status].label}
          </span>
          <span className="text-white/20">·</span>
          <span className="text-[11px] text-white/40">{snag.maintenance_type}</span>
        </div>

        {/* Report section */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">Snag Report</p>

          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
            <div>
              <p className="text-white/35 mb-0.5">Date</p>
              <p className="text-white font-medium">{formatDate(snag.date)}</p>
            </div>
            <div>
              <p className="text-white/35 mb-0.5">Reported By</p>
              <p className="text-white font-medium">{snag.reported_by}</p>
            </div>
            {snag.assigned_to && (
              <div>
                <p className="text-white/35 mb-0.5">Assigned To</p>
                <p className="text-white font-medium">{snag.assigned_to}</p>
              </div>
            )}
            <div>
              <p className="text-white/35 mb-0.5">Aircraft Hours</p>
              <p className="text-white font-medium">{snag.aircraft_hours?.toLocaleString()}h</p>
            </div>
            <div>
              <p className="text-white/35 mb-0.5">Cycles</p>
              <p className="text-white font-medium">{snag.aircraft_cycles?.toLocaleString()}</p>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white/[0.04] rounded-2xl p-4">
            <p className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap">{snag.description}</p>
          </div>
        </div>

        {/* Resolution section */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-white/25 uppercase tracking-wider">
            {isResolved ? 'Resolution' : 'Close Snag'}
          </p>

          {isResolved ? (
            // Read-only resolution
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div>
                  <p className="text-white/35 mb-0.5">Resolved By</p>
                  <p className="text-white font-medium">{snag.resolved_by}</p>
                </div>
                <div>
                  <p className="text-white/35 mb-0.5">Date Resolved</p>
                  <p className="text-white font-medium">{formatDate(snag.resolved_date)}</p>
                </div>
                {snag.resolved_hours && (
                  <div>
                    <p className="text-white/35 mb-0.5">Aircraft Hours</p>
                    <p className="text-white font-medium">{snag.resolved_hours?.toLocaleString()}h</p>
                  </div>
                )}
              </div>
              <div className="bg-white/[0.04] rounded-2xl p-4">
                <p className="text-xs text-white/90 leading-relaxed whitespace-pre-wrap">{snag.resolution_notes}</p>
              </div>
            </div>
          ) : (
            // Editable resolution form
            <div className="space-y-3">
              {/* Resolved By */}
              <div>
                <label className="label block mb-1.5">Resolved By</label>
                <div className="relative">
                  <select
                    value={resolvedBy}
                    onChange={e => setResolvedBy(e.target.value)}
                    className="input-field w-full appearance-none pr-8"
                    style={{ color: resolvedBy ? 'white' : 'rgba(255,255,255,0.25)' }}
                  >
                    <option value="" disabled>Select mechanic</option>
                    {RESOLVERS.map(name => (
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

              {/* Resolved Date + Hours side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label block mb-1.5">Date Resolved</label>
                  <input
                    type="date"
                    value={resolvedDate}
                    onChange={e => setResolvedDate(e.target.value)}
                    className="input-field w-full"
                  />
                </div>
                <div>
                  <label className="label block mb-1.5">Aircraft Hours</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={resolvedHours}
                      onChange={e => setResolvedHours(e.target.value)}
                      step="0.1" min="0"
                      className="input-field w-full pr-7"
                      placeholder="optional"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/30">h</span>
                  </div>
                </div>
              </div>

              {/* Action taken */}
              <div>
                <label className="label block mb-1.5">Action Taken</label>
                <textarea
                  value={resNotes}
                  onChange={e => setResNotes(e.target.value)}
                  rows={4}
                  placeholder={`Describe what was done to resolve the snag.\n\nExample: "Replaced landing light bulb P/N 4587-A. Tested — serviceable."`}
                  className="input-field w-full resize-none leading-relaxed"
                />
              </div>

              {error && <p className="text-xs text-red-400">{error}</p>}

              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                {snag.status === 'open' && (
                  <button
                    onClick={handleMarkInProgress}
                    className="py-3 rounded-2xl border border-white/10 text-white/60 text-sm font-semibold
                               active:bg-white/5 transition-colors"
                  >
                    Mark In Progress
                  </button>
                )}
                <button
                  onClick={handleResolve}
                  disabled={saving}
                  className={`py-3 rounded-2xl bg-white text-black text-sm font-bold
                              active:scale-[0.98] transition-transform disabled:opacity-40
                              ${snag.status === 'open' ? '' : 'col-span-2'}`}
                >
                  {saving ? 'Saving…' : 'Mark Resolved'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Snag row card ─────────────────────────────────────────────────────────────
function SnagCard({ snag, onClick }) {
  const cfg = STATUS[snag.status]
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-white/[0.04] rounded-2xl p-4 space-y-2
                 active:bg-white/[0.07] transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-white leading-snug flex-1">
          {snag.maintenance_type}
        </p>
        <span className={`flex-shrink-0 flex items-center gap-1 text-[10px] font-semibold ${cfg.text}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {cfg.label}
        </span>
      </div>

      <p className="text-[11px] text-white/50 leading-snug line-clamp-2">
        {snag.description}
      </p>

      <div className="flex items-center gap-3 text-[10px] text-white/25">
        <span>{formatDate(snag.date)}</span>
        <span>·</span>
        <span>{snag.reported_by}</span>
        <span>·</span>
        <span>{snag.aircraft_hours?.toLocaleString()}h</span>
      </div>
    </button>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────
export default function SnagListDrawer({ open, onClose }) {
  const { handleProps, panelProps, panelStyle } = useDrawerSwipe(onClose)
  const { selectedAircraft } = useAircraft()
  const { open: openSnags, inProgress, resolved, loading, refresh } = useSnags(selectedAircraft?.id)

  const [tab,          setTab]          = useState('open')
  const [selectedSnag, setSelectedSnag] = useState(null)
  const [reportOpen,   setReportOpen]   = useState(false)

  const tabSnags = tab === 'open'
    ? [...inProgress, ...openSnags]   // in-progress floats to top of open tab
    : resolved

  const openCount = openSnags.length + inProgress.length

  return (
    <>
      {/* Backdrop */}
      <div
        className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Panel */}
      <div className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`} style={panelStyle} {...panelProps}>

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {selectedSnag ? (
          // ── Detail / resolve view ──────────────────────────────────────────
          <SnagDetail
            snag={selectedSnag}
            onClose={() => setSelectedSnag(null)}
            onUpdated={() => { refresh(); setSelectedSnag(null) }}
          />
        ) : (
          // ── List view ──────────────────────────────────────────────────────
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-white">Snag List</h2>
                <p className="text-xs text-white/35 mt-0.5">
                  {selectedAircraft?.tail_number}
                  {openCount > 0 && (
                    <span className="ml-1.5 text-red-400 font-semibold">
                      · {openCount} open
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* New snag button */}
                <button
                  onClick={() => setReportOpen(true)}
                  className="fab"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                    strokeLinecap="round" className="w-4 h-4">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Report
                </button>
                {/* Close */}
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

            {/* Tabs */}
            <div className="flex gap-1 px-5 pb-3 flex-shrink-0">
              {[
                { key: 'open',     label: 'Open',     count: openCount },
                { key: 'resolved', label: 'Resolved', count: resolved.length },
              ].map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold
                              border transition-colors select-none
                              ${tab === t.key
                                ? 'bg-white text-black border-white'
                                : 'bg-transparent text-white/40 border-white/10'}`}
                >
                  {t.label}
                  {t.count > 0 && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full
                      ${tab === t.key ? 'bg-black/15' : 'bg-white/10'}`}>
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 pb-6"
              style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
              {loading ? (
                <p className="text-sm text-white/25 text-center pt-10">Loading…</p>
              ) : tabSnags.length === 0 ? (
                <div className="text-center pt-12 space-y-2">
                  <p className="text-white/20 text-sm">
                    {tab === 'open' ? 'No open snags' : 'No resolved snags yet'}
                  </p>
                  {tab === 'open' && (
                    <p className="text-white/15 text-xs">Aircraft is snag-free</p>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {tabSnags.map(snag => (
                    <SnagCard
                      key={snag.id}
                      snag={snag}
                      onClick={() => setSelectedSnag(snag)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Report new snag — layered on top */}
      <SnagDrawer
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        onSaved={() => { refresh(); setReportOpen(false) }}
      />
    </>
  )
}
