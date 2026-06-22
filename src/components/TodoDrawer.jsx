import { useState, useEffect } from 'react'
import { useDrawerSwipe } from '../hooks/useDrawerSwipe'
import { MANAGEMENT_GROUP } from '../hooks/useTodos'

// ── Constants ─────────────────────────────────────────────────────────────────

export const TEAM = [
  'James McBride',
  'Jay McMackin',
  'Daniel Sandoval',
  'Cesar Espinoza',
  'Antony Villalta',
  'Luis Soriano',
  'Javier Ascensio',
  'Alonia Ascensio',
  'Diego Urias',
  'Kelly Moreno',
]

export const CATEGORIES = [
  'Maintenance',
  'Operations',
  'Training',
  'Safety',
  'Procurement',
  'Admin',
  'Other',
]

export const PRIORITY = {
  urgent: { label: 'Urgent', activeStyle: { backgroundColor: 'rgba(239,68,68,0.2)',   color: '#ef4444' } },
  high:   { label: 'High',   activeStyle: { backgroundColor: 'rgba(249,115,22,0.2)',  color: '#fb923c' } },
  na:     { label: 'N/A',    activeStyle: { backgroundColor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.4)' } },
}

export const STATUS_CFG = {
  todo:        { label: 'To Do'      },
  in_progress: { label: 'In Progress'},
  done:        { label: 'Done'       },
}

function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Drawer — create or edit a single task ─────────────────────────────────────

export default function TodoDrawer({ open, onClose, onSave, onDelete, initial }) {
  const { handleProps, panelStyle } = useDrawerSwipe(onClose)

  const isEdit = !!initial?.id

  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [priority,    setPriority]    = useState('high')
  const [status,      setStatus]      = useState('todo')
  const [category,    setCategory]    = useState('')
  const [assignedTo,  setAssignedTo]  = useState('')
  const [createdBy,   setCreatedBy]   = useState('')
  const [dueDate,     setDueDate]     = useState('')
  const [visibleTo,   setVisibleTo]   = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)

  const viewer         = localStorage.getItem('cna_identity')
  const canSetVisibility = MANAGEMENT_GROUP.has(viewer)

  // Populate form when opening
  useEffect(() => {
    if (open) {
      setTitle(      initial?.title        ?? '')
      setDescription(initial?.description  ?? '')
      setPriority(   initial?.priority ?? 'high')
      setStatus(     initial?.status       ?? 'todo')
      setCategory(   initial?.category     ?? '')
      setAssignedTo( initial?.assigned_to  ?? '')
      setCreatedBy(  initial?.created_by   ?? '')
      setDueDate(    initial?.due_date     ?? '')
      setVisibleTo(  initial?.visible_to   ?? null)
      setError(null)
    }
  }, [open, initial])

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  async function handleSave() {
    if (!title.trim()) { setError('Title is required.'); return }
    setError(null); setSaving(true)
    try {
      await onSave({
        title:       title.trim(),
        description: description.trim() || null,
        priority,
        status,
        category:    category   || null,
        assigned_to: assignedTo || null,
        created_by:  createdBy  || null,
        due_date:    dueDate    || null,
        visible_to:  visibleTo  || null,
      })
      onClose()
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  async function handleDelete() {
    setSaving(true)
    try { await onDelete(initial.id); onClose() }
    catch (e) { setError(e.message); setSaving(false) }
  }

  return (
    <>
      <div
        className={`drawer-overlay ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      <div className={`drawer-panel ${open ? 'translate-y-0' : 'translate-y-full'}`} style={panelStyle}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab" {...handleProps}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 flex-shrink-0">
          <h2 className="text-lg font-bold text-white">{isEdit ? 'Edit Task' : 'New Task'}</h2>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/[0.07] flex items-center justify-center
                       text-white/50 active:bg-white/10 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
              strokeLinecap="round" className="w-4 h-4"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-2">

          {/* Title */}
          <div>
            <label className="label block mb-1.5">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="input-field w-full" />
          </div>

          {/* Description */}
          <div>
            <label className="label block mb-1.5">
              Description <span className="normal-case font-normal text-white/25">(optional)</span>
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Add more context…"
              className="input-field w-full resize-none" />
          </div>

          {/* Visibility segmented control — management only */}
          {canSetVisibility && (
            <div>
              <label className="label block mb-1.5">Visibility</label>
              <div style={{ position: 'relative', display: 'flex', background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: 3 }}>
                {/* Sliding pill */}
                <div style={{
                  position: 'absolute', top: 3, bottom: 3,
                  width: 'calc(50% - 3px)',
                  left: visibleTo === 'management' ? 'calc(50%)' : 3,
                  background: 'rgba(255,255,255,0.10)',
                  borderRadius: 9,
                  transition: 'left 0.22s cubic-bezier(0.4,0,0.2,1)',
                  pointerEvents: 'none',
                }} />
                {[
                  { key: null,           label: 'General',    },
                  { key: 'management',   label: 'Management', },
                ].map(({ key, label }) => {
                  const active = visibleTo === key
                  return (
                    <div key={label} onClick={() => setVisibleTo(key)}
                      style={{
                        flex: 1, padding: '7px 10px', zIndex: 1, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        fontSize: 12, fontWeight: 700, letterSpacing: '0.2px',
                        color: active ? 'white' : 'rgba(255,255,255,0.3)',
                        transition: 'color 0.22s',
                        userSelect: 'none',
                      }}
                    >
                      {label}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Priority */}
          <div>
            <label className="label block mb-1.5">Priority</label>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(PRIORITY).map(([key, cfg]) => (
                <button key={key} onClick={() => setPriority(key)}
                  style={priority === key ? cfg.activeStyle : {}}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-colors
                    ${priority === key ? 'border-transparent' : 'bg-transparent text-white/30 border-white/10'}`}>
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          {/* Status — edit only */}
          {isEdit && (
            <div>
              <label className="label block mb-1.5">Status</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(STATUS_CFG).map(([key, cfg]) => (
                  <button key={key} onClick={() => setStatus(key)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-colors
                      ${status === key ? 'bg-white/10 text-white border-white/20' : 'bg-transparent text-white/30 border-white/10'}`}>
                    {cfg.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category + Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label block mb-1.5">Category</label>
              <div className="relative">
                <select value={category} onChange={e => setCategory(e.target.value)}
                  className="input-field w-full appearance-none pr-7 text-sm"
                  style={{ color: category ? 'white' : 'rgba(255,255,255,0.25)' }}>
                  <option value="">None</option>
                  {CATEGORIES.map(c => (
                    <option key={c} value={c} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{c}</option>
                  ))}
                </select>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
            </div>
            <div>
              <label className="label block mb-1.5">Due Date</label>
              <input type="date" value={dueDate} min={today()} onChange={e => setDueDate(e.target.value)}
                className="input-field w-full text-sm"
                style={{ color: dueDate ? 'white' : 'rgba(255,255,255,0.25)' }} />
            </div>
          </div>

          {/* Assign To + Created By */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Created By', val: createdBy,  set: setCreatedBy,  placeholder: 'Select'     },
              { label: 'Assign To',  val: assignedTo, set: setAssignedTo, placeholder: 'Unassigned' },
            ].map(({ label, val, set, placeholder }) => (
              <div key={label}>
                <label className="label block mb-1.5">{label}</label>
                <div className="relative">
                  <select value={val} onChange={e => set(e.target.value)}
                    className="input-field w-full appearance-none pr-7 text-sm"
                    style={{ color: val ? 'white' : 'rgba(255,255,255,0.25)' }}>
                    <option value="">{placeholder}</option>
                    {TEAM.map(name => (
                      <option key={name} value={name} style={{ color: 'white', backgroundColor: '#1a1a1a' }}>{name}</option>
                    ))}
                  </select>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25 pointer-events-none">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            ))}
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          {/* Delete — edit only */}
          {isEdit && (
            <button onClick={handleDelete} disabled={saving}
              className="w-full py-3 rounded-2xl border border-red-500/20 text-red-400/70
                         text-sm font-semibold active:bg-red-500/10 transition-colors disabled:opacity-40">
              Delete Task
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-white/[0.06] px-5 pt-4"
          style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' }}>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="w-full py-3.5 rounded-2xl bg-white text-black font-bold text-sm
                       flex items-center justify-center gap-2
                       active:scale-[0.98] transition-transform disabled:opacity-40">
            {saving ? (
              <><span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Saving…</>
            ) : isEdit ? 'Save Changes' : 'Add Task'}
          </button>
        </div>
      </div>
    </>
  )
}
