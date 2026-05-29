import { useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { useEmployeeFlights } from '../hooks/useEmployeeFlights'
import { useTodos } from '../hooks/useTodos'
import { useTaskUpdates } from '../hooks/useTaskUpdates'
import { useGoogleCalendar } from '../hooks/useGoogleCalendar'
import TodoDrawer, { TEAM } from '../components/TodoDrawer'
import RosterDrawer from '../components/RosterDrawer'
import { supabase } from '../lib/supabase'
import { notifyAssignment } from '../lib/notifyAssignment'

// Priority border colors — inline styles to avoid Tailwind JIT issues
const PRIORITY_BORDER = {
  urgent: '#ef4444',
  high:   '#fb923c',
  medium: '#3b82f6',
  low:    'rgba(255,255,255,0.15)',
}

// ── Completion modal ──────────────────────────────────────────────────────────

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function CompletionModal({ task, onConfirm, onCancel }) {
  const [mode,   setMode]   = useState('in_progress')
  const [date,   setDate]   = useState(today())
  const [notes,  setNotes]  = useState('')
  const [author, setAuthor] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState(null)

  const isCompleted = mode === 'completed'

  async function handleConfirm() {
    setSaving(true)
    setError(null)
    try {
      await onConfirm({ mode, date, notes, author })
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center px-4 pb-8">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08]
                      shadow-2xl overflow-hidden space-y-4 p-5"
           style={{ background: '#111113' }}>

        {/* Title */}
        <div>
          <h3 className="text-base font-bold text-white">Task</h3>
          <p className="text-xs text-white/35 mt-0.5 truncate">{task.title}</p>
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => setMode('in_progress')}
            className={`py-2 rounded-xl text-xs font-semibold transition-all ${
              !isCompleted ? 'bg-yellow-400/20 text-yellow-400' : 'text-white/30'
            }`}
          >
            In Progress
          </button>
          <button
            onClick={() => setMode('completed')}
            className={`py-2 rounded-xl text-xs font-semibold transition-all ${
              isCompleted ? 'bg-green-500/20 text-green-400' : 'text-white/30'
            }`}
          >
            Completed
          </button>
        </div>

        {/* Posted by — only for in_progress */}
        {!isCompleted && (
          <div>
            <label className="label block mb-1.5">Posted by</label>
            <div className="relative">
              <select value={author} onChange={e => setAuthor(e.target.value)}
                className="input-field w-full appearance-none pr-7 text-sm"
                style={{ color: author ? 'white' : 'rgba(255,255,255,0.25)' }}>
                <option value="">Select</option>
                {TEAM.map(n => (
                  <option key={n} value={n} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{n}</option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
        )}

        {/* Date */}
        <div>
          <label className="label block mb-1.5">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="input-field w-full" />
        </div>

        {/* Actions taken */}
        <div>
          <label className="label block mb-1.5">Actions Taken</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            placeholder={isCompleted
              ? 'Describe what was done to complete this task…'
              : 'What progress was made? What is the current status…'}
            className="input-field w-full resize-none"
          />
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <button onClick={onCancel} disabled={saving}
            className="py-3 rounded-2xl border border-white/10 text-white/50 text-sm font-semibold
                       active:bg-white/[0.05] transition-colors disabled:opacity-40">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className={`py-3 rounded-2xl text-sm font-bold active:scale-[0.98] transition-transform disabled:opacity-40 ${
              isCompleted ? 'bg-white text-black' : 'text-black'
            }`}
            style={!isCompleted ? { backgroundColor: '#facc15' } : {}}
          >
            {isCompleted ? 'Mark Done' : 'Add Update'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name) {
  return name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'
}

function dueDateLabel(dateStr) {
  if (!dateStr) return null
  const due = new Date(dateStr + 'T12:00:00')
  const now  = new Date(); now.setHours(0,0,0,0); due.setHours(0,0,0,0)
  const diff = Math.round((due - now) / (1000 * 60 * 60 * 24))
  if (diff < 0)   return { text: `${Math.abs(diff)}d overdue`, cls: 'text-red-400'    }
  if (diff === 0) return { text: 'Today',                      cls: 'text-yellow-400' }
  if (diff === 1) return { text: 'Tomorrow',                   cls: 'text-yellow-400' }
  if (diff <= 7)  return { text: `${diff} days`,               cls: 'text-white/40'   }
  return {
    text: due.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }),
    cls:  'text-white/30',
  }
}

function isOverdue(dateStr) {
  if (!dateStr) return false
  const due = new Date(dateStr + 'T12:00:00')
  due.setHours(0,0,0,0)
  const now = new Date(); now.setHours(0,0,0,0)
  return due < now
}

// ── Task card ─────────────────────────────────────────────────────────────────

function TaskCard({ todo, onCircleTap, onEdit, onTap }) {
  const due    = dueDateLabel(todo.due_date)
  const isDone = todo.status === 'done'
  const borderColor = PRIORITY_BORDER[todo.priority] ?? PRIORITY_BORDER.medium

  return (
    <div
      onClick={() => onTap ? onTap(todo) : onEdit(todo)}
      style={{ borderLeftColor: borderColor }}
      className={`flex gap-3 px-4 py-3.5 border-l-2 cursor-pointer
                  active:bg-white/[0.03] transition-colors
                  ${isDone ? 'opacity-40' : ''}`}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); onCircleTap(todo) }}
        className={`flex-shrink-0 w-5 h-5 mt-0.5 rounded-full border-2 flex items-center justify-center
                    transition-all ${isDone
                      ? 'bg-green-500 border-green-500'
                      : 'bg-transparent border-white/20 active:border-white/50'}`}
      >
        {isDone && (
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3}
            strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-snug ${isDone ? 'line-through text-white/30' : 'text-white'}`}>
          {todo.title}
        </p>

        {/* Meta */}
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {todo.category && (
            <span className="text-[10px] text-white/30">{todo.category}</span>
          )}
          {due && (
            <>
              {todo.category && <span className="text-white/15 text-[10px]">·</span>}
              <span className={`text-[10px] font-medium ${due.cls}`}>{due.text}</span>
            </>
          )}
          {todo.description && (
            <span className="text-[10px] text-white/20 truncate max-w-[120px]">{todo.description}</span>
          )}
        </div>
      </div>

      {/* Assignee */}
      {todo.assigned_to && (
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-white/[0.08] flex items-center justify-center mt-0.5">
          <span className="text-[9px] font-bold text-white/50">{initials(todo.assigned_to)}</span>
        </div>
      )}
    </div>
  )
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({ label, statusColor, items, onCircleTap, onEdit, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  if (items.length === 0) return null

  return (
    <div>
      <button onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 w-full px-4 py-2">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
          strokeLinecap="round"
          className={`w-3 h-3 text-white/25 transition-transform ${open ? 'rotate-90' : ''}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${statusColor}`}>{label}</span>
        <span className="text-[10px] text-white/20 font-medium">{items.length}</span>
      </button>

      {open && (
        <div className="divide-y divide-white/[0.04]">
          {items.map(t => (
            <TaskCard key={t.id} todo={t} onCircleTap={onCircleTap} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Calendar event popup ──────────────────────────────────────────────────────

function CalendarEventPopup({ event, onClose }) {
  function fmtTime(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }
  function fmtDate(iso) {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden flex"
           style={{ background: '#111113' }}>

        {/* Left accent — calendar blue */}
        <div className="w-1 flex-shrink-0" style={{ backgroundColor: '#63b3ed', opacity: 0.7 }} />

        <div className="flex-1 p-5 space-y-4">

          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(99,179,237,0.15)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                strokeLinecap="round" className="w-4 h-4" style={{ color: '#63b3ed' }}>
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider mb-0.5"
                style={{ color: '#63b3ed' }}>Google Calendar</p>
              <h3 className="text-base font-bold text-white leading-snug">{event.title}</h3>
            </div>
          </div>

          {/* Date + time */}
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <div>
              <p className="text-[10px] text-white/25 mb-0.5">Date</p>
              <p className="text-xs font-semibold text-white/60">{fmtDate(event.start)}</p>
            </div>
            {event.start && (
              <div>
                <p className="text-[10px] text-white/25 mb-0.5">Time</p>
                <p className="text-xs font-semibold text-white/60">
                  {fmtTime(event.start)}{event.end ? ` → ${fmtTime(event.end)}` : ''}
                </p>
              </div>
            )}
          </div>

          <button onClick={onClose}
            className="w-full py-3 rounded-2xl border border-white/10 text-white/40 text-sm font-semibold
                       active:bg-white/[0.05] transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Task popup (calendar tap) ─────────────────────────────────────────────────

const PRIORITY_LABEL = { urgent: 'Urgent', high: 'High', medium: 'Medium', low: 'Low' }
const STATUS_LABEL   = { todo: 'Inbox', in_progress: 'In Progress', done: 'Done' }

function TaskPopup({ task, onClose, onEdit, aircraftId }) {
  const { updates, loading: updatesLoading, addUpdate, editUpdate } = useTaskUpdates(task.id, aircraftId)

  const [showAddForm, setShowAddForm] = useState(false)
  const [newAuthor,   setNewAuthor]   = useState('')
  const [newDate,     setNewDate]     = useState(today())
  const [newNotes,    setNewNotes]    = useState('')
  const [adding,      setAdding]      = useState(false)
  const [editingId,   setEditingId]   = useState(null)
  const [editingText, setEditingText] = useState('')
  const [editSaving,  setEditSaving]  = useState(false)

  const due = dueDateLabel(task.due_date)

  const priorityColor = {
    urgent: { bg: 'rgba(239,68,68,0.15)',   text: '#ef4444' },
    high:   { bg: 'rgba(249,115,22,0.15)',  text: '#fb923c' },
    medium: { bg: 'rgba(59,130,246,0.15)',  text: '#60a5fa' },
    low:    { bg: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.4)' },
  }[task.priority] ?? { bg: 'rgba(59,130,246,0.15)', text: '#60a5fa' }

  function fmtDate(str) {
    if (!str) return ''
    return new Date(str + 'T12:00:00').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  async function handleAddUpdate() {
    if (!newNotes.trim()) return
    setAdding(true)
    try {
      await addUpdate({ author: newAuthor, notes: newNotes.trim(), updateDate: newDate })
      setNewNotes('')
      setNewAuthor('')
      setNewDate(today())
      setShowAddForm(false)
    } catch (e) { /* surface silently for now */ }
    setAdding(false)
  }

  async function handleEditSave(id) {
    if (!editingText.trim()) return
    setEditSaving(true)
    try { await editUpdate(id, editingText.trim()); setEditingId(null) }
    catch (e) { /* */ }
    setEditSaving(false)
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.08] shadow-2xl overflow-hidden flex flex-col"
           style={{ background: '#111113', maxHeight: '88vh' }}>

        {/* Strip + scrollable body */}
        <div className="flex flex-1 min-h-0">

          {/* Left accent strip */}
          <div className="w-1 flex-shrink-0"
            style={{ backgroundColor: priorityColor.text, opacity: 0.7 }} />

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Badges + edit button */}
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: priorityColor.bg, color: priorityColor.text }}>
                    {PRIORITY_LABEL[task.priority] ?? 'Medium'}
                  </span>
                  <span className="text-[10px] font-semibold text-white/30 px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
                    {STATUS_LABEL[task.status] ?? task.status}
                  </span>
                  {task.category && (
                    <span className="text-[10px] text-white/25 px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                      {task.category}
                    </span>
                  )}
                </div>
                {onEdit && (
                  <button onClick={() => { onClose(); onEdit(task) }}
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center active:bg-white/10"
                    style={{ background: 'rgba(255,255,255,0.07)' }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      strokeLinecap="round" className="w-3.5 h-3.5 text-white/50">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                )}
              </div>
              <h3 className="text-base font-bold text-white leading-snug">{task.title}</h3>
            </div>

            {/* Description */}
            {task.description && (
              <p className="text-sm text-white/45 leading-relaxed">{task.description}</p>
            )}

            {/* Meta */}
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {due && (
                <div>
                  <p className="text-[10px] text-white/25 mb-0.5">Due</p>
                  <p className={`text-xs font-semibold ${due.cls}`}>{due.text}</p>
                </div>
              )}
              {task.assigned_to && (
                <div>
                  <p className="text-[10px] text-white/25 mb-0.5">Assigned to</p>
                  <p className="text-xs font-semibold text-white/60">{task.assigned_to}</p>
                </div>
              )}
              {task.created_by && (
                <div>
                  <p className="text-[10px] text-white/25 mb-0.5">Created by</p>
                  <p className="text-xs font-semibold text-white/60">{task.created_by}</p>
                </div>
              )}
            </div>

            {/* ── Updates thread ── */}
            <div className="border-t border-white/[0.06] pt-4 space-y-3">
              <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider">
                Updates{updates.length > 0 ? ` · ${updates.length}` : ''}
              </p>

              {updatesLoading ? (
                <div className="space-y-2">
                  {[1,2].map(i => <div key={i} className="h-14 rounded-xl bg-white/[0.03] animate-pulse" />)}
                </div>
              ) : updates.length === 0 ? (
                <p className="text-[12px] text-white/20">No updates yet — add the first one below.</p>
              ) : (
                <div className="space-y-2">
                  {updates.map(u => (
                    <div key={u.id} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.04)' }}>
                      {editingId === u.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={editingText}
                            onChange={e => setEditingText(e.target.value)}
                            rows={3}
                            className="input-field w-full resize-none text-sm"
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button onClick={() => handleEditSave(u.id)} disabled={editSaving}
                              className="flex-1 py-1.5 rounded-xl bg-white text-black text-xs font-bold disabled:opacity-40">
                              {editSaving ? 'Saving…' : 'Save'}
                            </button>
                            <button onClick={() => setEditingId(null)}
                              className="flex-1 py-1.5 rounded-xl border border-white/10 text-white/40 text-xs">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              {u.author && (
                                <div className="w-5 h-5 rounded-full bg-white/[0.08] flex items-center justify-center">
                                  <span className="text-[8px] font-bold text-white/50">{initials(u.author)}</span>
                                </div>
                              )}
                              <span className="text-[11px] font-semibold text-white/50">{u.author || '—'}</span>
                              <span className="text-[10px] text-white/25">{fmtDate(u.update_date)}</span>
                            </div>
                            <button
                              onClick={() => { setEditingId(u.id); setEditingText(u.notes) }}
                              className="w-6 h-6 rounded-full flex items-center justify-center active:bg-white/10">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                strokeLinecap="round" className="w-3 h-3 text-white/25">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                              </svg>
                            </button>
                          </div>
                          <p className="text-sm text-white/60 leading-relaxed">{u.notes}</p>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add update form — shown when triggered from footer */}
              {showAddForm && (
                <div className="space-y-2 pt-1 border-t border-white/[0.05]">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <select value={newAuthor} onChange={e => setNewAuthor(e.target.value)}
                        className="input-field w-full appearance-none pr-6 text-xs"
                        style={{ color: newAuthor ? 'white' : 'rgba(255,255,255,0.25)' }}>
                        <option value="">Posted by</option>
                        {TEAM.map(n => (
                          <option key={n} value={n} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{n}</option>
                        ))}
                      </select>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-white/25 pointer-events-none">
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </div>
                    <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)}
                      className="input-field text-xs"
                      style={{ color: newDate ? 'white' : 'rgba(255,255,255,0.25)' }} />
                  </div>
                  <textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    rows={3}
                    placeholder="What was done or what is the current status…"
                    className="input-field w-full resize-none text-sm"
                    autoFocus
                  />
                  <button onClick={handleAddUpdate} disabled={adding || !newNotes.trim()}
                    className="w-full py-2.5 rounded-2xl bg-white text-black text-sm font-bold
                               active:scale-[0.98] transition-transform disabled:opacity-40">
                    {adding ? 'Saving…' : 'Post Update'}
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-white/[0.06] grid grid-cols-2 gap-3">
          <button onClick={onClose}
            className="py-3 rounded-2xl border border-white/10 text-white/40 text-sm font-semibold
                       active:bg-white/[0.05] transition-colors">
            Close
          </button>
          <button
            onClick={() => { setShowAddForm(v => !v); setNewNotes(''); setNewAuthor('') }}
            className={`py-3 rounded-2xl border text-sm font-semibold transition-colors
              ${showAddForm
                ? 'border-white/20 bg-white/[0.07] text-white/70'
                : 'border-white/10 text-white/40 active:bg-white/[0.05]'}`}>
            Update
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Mini calendar ─────────────────────────────────────────────────────────────

const DAY_SHORT  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

const PRIORITY_DOT = {
  urgent: '#ef4444',
  high:   '#fb923c',
  medium: '#3b82f6',
  low:    'rgba(255,255,255,0.25)',
}

function MiniCalendar({ todos, onTaskTap, onEventTap }) {
  const base = new Date(); base.setHours(0, 0, 0, 0)
  const { events: calEvents, loading: calLoading } = useGoogleCalendar(3)

  const days = [0, 1, 2].map(offset => {
    const d = new Date(base)
    d.setDate(d.getDate() + offset)
    return d
  })

  function toDateStr(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  function tasksForDay(d) {
    const str = toDateStr(d)
    return todos.filter(t => t.due_date === str && t.status !== 'done')
  }

  function eventsForDay(d) {
    return calEvents[toDateStr(d)] ?? []
  }

  return (
    <div>
      <p className="text-[11px] font-semibold text-white/25 uppercase tracking-wider mb-2 px-0.5">
        {MONTH_SHORT[base.getMonth()]} {base.getFullYear()}
      </p>
      <div className="flex gap-2">
        {days.map((day, i) => {
          const isToday  = i === 0
          const tasks    = tasksForDay(day)
          const gcEvents = eventsForDay(day)
          const isEmpty  = tasks.length === 0 && gcEvents.length === 0

          return (
            <div
              key={i}
              className="flex-1 rounded-2xl p-4 flex flex-col"
              style={{
                height: '44vh',
                background: isToday ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
              }}
            >
              {/* Day label */}
              <p className={`text-[10px] font-semibold uppercase tracking-wider mb-1
                ${isToday ? 'text-white/50' : 'text-white/20'}`}>
                {isToday ? 'Today' : DAY_SHORT[day.getDay()]}
              </p>

              {/* Date number */}
              <div className={`w-9 h-9 rounded-full flex items-center justify-center mb-3 flex-shrink-0
                ${isToday ? 'bg-white' : ''}`}>
                <span className={`text-lg font-bold leading-none
                  ${isToday ? 'text-black' : 'text-white/70'}`}>
                  {day.getDate()}
                </span>
              </div>

              {/* Content */}
              <div className="flex-1 flex flex-col gap-1.5 overflow-hidden">
                {/* Google Calendar events */}
                {calLoading && i === 0 && (
                  <div className="h-6 rounded-lg bg-white/[0.04] animate-pulse" />
                )}
                {gcEvents.map((ev, j) => (
                  <button key={j}
                    onClick={() => onEventTap(ev)}
                    className="flex items-start gap-1.5 rounded-xl px-2 py-1.5 w-full text-left active:opacity-60 transition-opacity"
                    style={{ background: 'rgba(99,179,237,0.12)' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                      strokeLinecap="round" className="w-2.5 h-2.5 flex-shrink-0 mt-0.5"
                      style={{ color: '#63b3ed' }}>
                      <rect x="3" y="4" width="18" height="18" rx="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span className="text-[10px] leading-tight line-clamp-2"
                      style={{ color: '#90cdf4' }}>{ev.title}</span>
                  </button>
                ))}

                {/* Task divider when both exist */}
                {gcEvents.length > 0 && tasks.length > 0 && (
                  <div className="border-t border-white/[0.06] my-0.5" />
                )}

                {/* Tasks */}
                {tasks.slice(0, 4).map(t => (
                  <button
                    key={t.id}
                    onClick={() => onTaskTap(t)}
                    className="flex items-start gap-1.5 rounded-xl px-2 py-1.5 w-full text-left active:opacity-60 transition-opacity"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-0.5"
                      style={{ backgroundColor: PRIORITY_DOT[t.priority] ?? PRIORITY_DOT.medium }} />
                    <span className="text-[10px] text-white/55 leading-tight line-clamp-2">{t.title}</span>
                  </button>
                ))}

                {isEmpty && !calLoading && (
                  <p className="text-[11px] text-white/15 mt-1">Nothing scheduled</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Stat chip (tab) ───────────────────────────────────────────────────────────

function StatChip({ value, label, accent, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-2xl px-3 py-3 text-center transition-all
        ${active ? 'bg-white/[0.10] ring-1 ring-white/10' : 'bg-white/[0.04]'}`}
    >
      <p className={`text-xl font-bold ${accent ?? 'text-white'}`}>{value}</p>
      <p className={`text-[10px] mt-0.5 ${active ? 'text-white/50' : 'text-white/30'}`}>{label}</p>
    </button>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Employees() {
  const { selectedAircraft } = useAircraft()
  const { pilots, mechanics, operations, loading: rosterLoading, dbProfiles, saveProfile } =
    useEmployeeFlights(selectedAircraft?.id)

  const { todos, todo, inProgress, done, loading: todosLoading, addTodo, updateTodo, deleteTodo, completeTodo, undoComplete } =
    useTodos(selectedAircraft?.id)

  const [rosterOpen,  setRosterOpen]  = useState(false)
  const [todoOpen,    setTodoOpen]    = useState(false)
  const [editing,     setEditing]     = useState(null)   // task being edited
  const [filter,      setFilter]      = useState('')     // assigned_to filter
  const [completing,    setCompleting]    = useState(null)
  const [activeTab,     setActiveTab]     = useState('inbox')
  const [calendarTask,  setCalendarTask]  = useState(null)   // task tapped from calendar
  const [previewTask,   setPreviewTask]   = useState(null)   // task tapped from list
  const [calendarEvent, setCalendarEvent] = useState(null)   // google calendar event tapped

  // Derive sections
  const overdueItems   = [...todo, ...inProgress].filter(t => isOverdue(t.due_date))
  const overdueIds     = new Set(overdueItems.map(t => t.id))
  const inboxItems     = todo.filter(t => !overdueIds.has(t.id))
  const activeItems    = inProgress.filter(t => !overdueIds.has(t.id))

  // Active tab's items
  const tabItems = {
    inbox:       inboxItems,
    in_progress: activeItems,
    overdue:     overdueItems,
    done,
  }[activeTab] ?? []

  // Assignees for current tab only
  const assignees = [...new Set(tabItems.map(t => t.assigned_to).filter(Boolean))]

  const visibleItems = filter ? tabItems.filter(t => t.assigned_to === filter) : tabItems

  function getProfile(person) {
    const db = dbProfiles[person.name] || {}
    return { ...person, ...Object.fromEntries(Object.entries(db).filter(([, v]) => v != null)) }
  }

  function openEdit(task) { setEditing(task); setTodoOpen(true) }
  function openCreate()   { setEditing(null); setTodoOpen(true) }

  function handleCircleTap(task) {
    if (task.status === 'done') { undoComplete(task) }
    else                        { setCompleting(task) }  // opens modal for todo + in_progress
  }

  async function handleSave(payload) {
    const prevAssignee = editing?.assigned_to ?? null
    if (editing) { await updateTodo(editing.id, payload) }
    else         { await addTodo(payload) }

    // Notify the assignee if they were just assigned (new task or reassigned)
    if (payload.assigned_to && payload.assigned_to !== prevAssignee) {
      notifyAssignment({
        assignee:   payload.assigned_to,
        title:      payload.title,
        dueDate:    payload.due_date ?? null,
        assignedBy: localStorage.getItem('cna_identity') ?? null,
      })
    }
  }

  const noTasks   = !todosLoading && inboxItems.length === 0 && activeItems.length === 0 && overdueItems.length === 0 && done.length === 0
  const tabEmpty  = !todosLoading && tabItems.length === 0

  function switchTab(tab) { setActiveTab(tab); setFilter('') }

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-4">
        <div>
          <h1 className="page-title">Team</h1>
          <p className="text-xs text-white/35 mt-0.5">Cielo Norte Aviación</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRosterOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-white/10
                       text-xs font-semibold text-white/50 active:bg-white/[0.06] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="w-3.5 h-3.5">
              <circle cx="9" cy="7" r="4" />
              <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75M21 21v-2a4 4 0 0 0-3-3.85" />
            </svg>
            Roster
          </button>
          <button className="fab" onClick={openCreate}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
              strokeLinecap="round" className="w-4 h-4">
              <path d="M12 5v14M5 12h14" />
            </svg>
            To Do
          </button>
        </div>
      </div>

      <div className="px-4 pb-6 space-y-4">

        {/* Mini calendar — inbox only, scrolls with page */}
        {activeTab === 'inbox' && !todosLoading && (
          <MiniCalendar todos={todos} onTaskTap={setCalendarTask} onEventTap={setCalendarEvent} />
        )}

        {/* Tab chips */}
        <div className="flex gap-2">
          <StatChip value={inboxItems.length}   label="Inbox"       active={activeTab === 'inbox'}
            accent={inboxItems.length > 0 ? 'text-white' : 'text-white/30'}
            onClick={() => switchTab('inbox')} />
          <StatChip value={activeItems.length}  label="In Progress" active={activeTab === 'in_progress'}
            accent={activeItems.length > 0 ? 'text-yellow-400' : 'text-white/30'}
            onClick={() => switchTab('in_progress')} />
          <StatChip value={overdueItems.length} label="Overdue"     active={activeTab === 'overdue'}
            accent={overdueItems.length > 0 ? 'text-orange-400' : 'text-white/30'}
            onClick={() => switchTab('overdue')} />
          <StatChip value={done.length}         label="Done"        active={activeTab === 'done'}
            accent={done.length > 0 ? 'text-green-400' : 'text-white/30'}
            onClick={() => switchTab('done')} />
        </div>

        {/* Assignee filter */}
        {assignees.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              onClick={() => setFilter('')}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                ${!filter ? 'bg-white text-black border-white' : 'text-white/40 border-white/10'}`}
            >
              All
            </button>
            {assignees.map(name => (
              <button
                key={name}
                onClick={() => setFilter(name === filter ? '' : name)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors
                  ${filter === name ? 'bg-white text-black border-white' : 'text-white/40 border-white/10'}`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold
                  ${filter === name ? 'bg-black/15 text-black' : 'bg-white/10 text-white/50'}`}>
                  {initials(name)}
                </span>
                {name.split(' ')[0]}
              </button>
            ))}
          </div>
        )}

        {/* Task list */}
        {todosLoading ? (
          <div className="space-y-px">
            {[1,2,3].map(i => <div key={i} className="h-14 bg-white/[0.03] animate-pulse" />)}
          </div>
        ) : noTasks ? (
          <div className="text-center pt-12 space-y-2">
            <p className="text-3xl">✓</p>
            <p className="text-white/30 text-sm font-medium">No tasks yet</p>
            <p className="text-white/20 text-xs">Tap + To Do to add the first one</p>
          </div>
        ) : tabEmpty ? (
          <div className="text-center pt-10 space-y-1">
            <p className="text-white/20 text-sm font-medium">Nothing here</p>
          </div>
        ) : (
          <div className="bg-white/[0.03] rounded-2xl overflow-hidden divide-y divide-white/[0.04]">
            {visibleItems.map(t => (
              <TaskCard key={t.id} todo={t} onCircleTap={handleCircleTap} onEdit={openEdit} onTap={setPreviewTask} />
            ))}
          </div>
        )}
      </div>

      {/* Roster drawer — conditionally mounted so inputs never live in the DOM when closed */}
      {rosterOpen && (
        <RosterDrawer
          open={rosterOpen}
          onClose={() => setRosterOpen(false)}
          pilots={pilots}
          mechanics={mechanics}
          operations={operations}
          loading={rosterLoading}
          getProfile={getProfile}
          onSave={saveProfile}
        />
      )}

      {/* Create / edit task drawer — conditionally mounted so inputs never live in the DOM when closed */}
      {todoOpen && (
        <TodoDrawer
          open={todoOpen}
          onClose={() => { setTodoOpen(false); setEditing(null) }}
          onSave={handleSave}
          onDelete={deleteTodo}
          initial={editing}
        />
      )}

      {/* Google Calendar event popup */}
      {calendarEvent && (
        <CalendarEventPopup event={calendarEvent} onClose={() => setCalendarEvent(null)} />
      )}

      {/* Calendar task popup */}
      {calendarTask && (
        <TaskPopup task={calendarTask} aircraftId={selectedAircraft?.id}
          onClose={() => setCalendarTask(null)}
          onEdit={t => { setCalendarTask(null); openEdit(t) }} />
      )}

      {/* Task list preview popup */}
      {previewTask && (
        <TaskPopup task={previewTask} aircraftId={selectedAircraft?.id}
          onClose={() => setPreviewTask(null)}
          onEdit={t => { setPreviewTask(null); openEdit(t) }} />
      )}

      {/* Completion modal */}
      {completing && (
        <CompletionModal
          task={completing}
          onConfirm={async ({ mode, date, notes, author }) => {
            if (mode === 'completed') {
              await completeTodo(completing, { completedDate: date, notes })
            } else {
              // Move to in_progress if not already
              if (completing.status !== 'in_progress') {
                await updateTodo(completing.id, { status: 'in_progress' })
              }
              // Save update to thread if notes provided
              if (notes?.trim()) {
                const { error } = await supabase.from('task_updates').insert({
                  todo_id:     completing.id,
                  aircraft_id: selectedAircraft?.id,
                  author:      author || null,
                  notes:       notes.trim(),
                  update_date: date,
                })
                if (error) throw new Error(error.message)
              }
            }
            setCompleting(null)
          }}
          onCancel={() => setCompleting(null)}
        />
      )}
    </div>
  )
}
