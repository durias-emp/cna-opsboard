import { useState } from 'react'
import { useAircraft } from '../context/AircraftContext'
import { useEmployeeFlights } from '../hooks/useEmployeeFlights'

const toHobbs = mins => Math.floor(mins / 6) / 10

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function calcAge(dob) {
  if (!dob) return null
  const birth = new Date(dob + 'T12:00:00')
  const now   = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

function yearsAtCompany(startDate) {
  if (!startDate) return null
  const start = new Date(startDate + 'T12:00:00')
  const now   = new Date()
  const years = (now - start) / (1000 * 60 * 60 * 24 * 365.25)
  if (years < 1) {
    const months = Math.floor(years * 12)
    return months <= 1 ? '1 month' : `${months} months`
  }
  const y = Math.floor(years)
  return y === 1 ? '1 year' : `${y} years`
}

function flightRoute(flight) {
  const first = flight.legs?.[0]
  const last  = flight.legs?.[flight.legs.length - 1]
  if (!first?.takeoff_location || !last?.landing_location) return '—'
  return `${first.takeoff_location} → ${last.landing_location}`
}

function initials(name) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

// ── Profile Modal ──────────────────────────────────────────────────────────────

function ProfileModal({ person, isPilot, onClose, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(person)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  function set(field, val) { setDraft(d => ({ ...d, [field]: val })) }

  function setLicense(i, field, val) {
    setDraft(d => ({
      ...d,
      licenses: d.licenses.map((l, idx) => idx === i ? { ...l, [field]: val } : l),
    }))
  }

  function addLicense() {
    setDraft(d => ({ ...d, licenses: [...(d.licenses || []), { label: '', number: '' }] }))
  }

  function removeLicense(i) {
    setDraft(d => ({ ...d, licenses: d.licenses.filter((_, idx) => idx !== i) }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      await onSave(draft)
      setEditing(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setDraft(person)
    setEditing(false)
    setError(null)
  }

  const age = calcAge(draft.dob)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-5">
      <div className="absolute inset-0 bg-black/70" onClick={editing ? undefined : onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-white/[0.10] shadow-2xl overflow-hidden"
           style={{ background: '#0e0e10', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div className="px-6 pt-6 pb-5 flex items-start justify-between"
             style={{ background: 'linear-gradient(160deg,#17171a,#111113)' }}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-white/[0.09] flex items-center justify-center flex-shrink-0">
              <span className="text-base font-bold text-white/70">{initials(draft.name)}</span>
            </div>
            <div>
              <p className="text-base font-bold text-white leading-tight">{draft.name}</p>
              {draft.role && (
                <p className="text-[11px] text-white/40 mt-0.5">{draft.role}</p>
              )}
              {isPilot && (
                <span className="inline-block mt-1.5 text-[9px] font-bold uppercase tracking-widest
                                 bg-white/[0.08] text-white/40 px-2 py-0.5 rounded-full">
                  Pilot
                </span>
              )}
            </div>
          </div>

          {/* Edit / Close buttons */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {!editing ? (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="text-[11px] text-white/40 hover:text-white/70 bg-white/[0.06] border border-white/[0.08]
                             rounded-lg px-3 py-1.5 transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center
                             text-white/40 active:bg-white/10 transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    strokeLinecap="round" className="w-3.5 h-3.5">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCancel}
                  className="text-[11px] text-white/40 hover:text-white/70 bg-white/[0.06] border border-white/[0.08]
                             rounded-lg px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="text-[11px] font-semibold text-black bg-white hover:bg-white/90
                             rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50
                             flex items-center gap-1.5"
                >
                  {saving && (
                    <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  )}
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-5">
          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>
          )}

          {/* General info */}
          <div className="space-y-3">
            <p className="text-[10px] text-white/25 uppercase tracking-widest">Personal Info</p>

            {/* DOB + Age */}
            <div className="flex gap-3">
              <div className="flex-1">
                <p className="text-[10px] text-white/30 mb-1">Date of Birth</p>
                {editing ? (
                  <input type="date" value={draft.dob || ''} onChange={e => set('dob', e.target.value)}
                    className="input-field w-full text-sm" />
                ) : (
                  <p className="text-sm text-white">{formatDate(draft.dob)}</p>
                )}
              </div>
              <div className="w-16 flex-shrink-0">
                <p className="text-[10px] text-white/30 mb-1">Age</p>
                <p className="text-sm text-white">{age ?? '—'}</p>
              </div>
            </div>

            {/* Start date */}
            <div>
              <p className="text-[10px] text-white/30 mb-1">With the Company</p>
              {editing ? (
                <input type="date" value={draft.startDate || ''} onChange={e => set('startDate', e.target.value)}
                  className="input-field w-full text-sm" />
              ) : (
                <p className="text-sm text-white">
                  {formatDate(draft.startDate)}
                  {draft.startDate && (
                    <span className="text-white/30 text-xs ml-2">({yearsAtCompany(draft.startDate)})</span>
                  )}
                </p>
              )}
            </div>

            {/* Phone */}
            <div>
              <p className="text-[10px] text-white/30 mb-1">Contact</p>
              {editing ? (
                <input type="text" value={draft.phone || ''} onChange={e => set('phone', e.target.value)}
                  placeholder="XXXX-XXXX" className="input-field w-full text-sm" />
              ) : (
                <p className="text-sm text-white">{draft.phone || '—'}</p>
              )}
            </div>
          </div>

          {/* Credentials (pilots + mechanics with licenses) */}
          {(isPilot || (draft.licenses && draft.licenses.length > 0)) && (
            <div className="space-y-3 border-t border-white/[0.06] pt-5">
              <p className="text-[10px] text-white/25 uppercase tracking-widest">
                {isPilot ? 'Pilot Credentials' : 'Credentials'}
              </p>

              {/* Licenses */}
              <div>
                <p className="text-[10px] text-white/30 mb-2">Licenses</p>
                <div className="space-y-2">
                  {(draft.licenses || []).map((lic, i) => (
                    editing ? (
                      <div key={i} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Country"
                          value={lic.label}
                          onChange={e => setLicense(i, 'label', e.target.value)}
                          className="input-field w-28 flex-shrink-0 text-sm"
                        />
                        <input
                          type="text"
                          placeholder="Number"
                          value={lic.number}
                          onChange={e => setLicense(i, 'number', e.target.value)}
                          className="input-field flex-1 text-sm"
                        />
                        <button onClick={() => removeLicense(i)}
                          className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center
                                     text-white/30 active:text-white/60 flex-shrink-0">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                            strokeLinecap="round" className="w-3 h-3">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ) : (
                      <div key={i} className="flex items-center justify-between
                                              bg-white/[0.04] rounded-xl px-3.5 py-2.5
                                              border border-white/[0.06]">
                        <span className="text-[11px] text-white/40">{lic.label}</span>
                        <span className="text-sm font-bold text-white tabular-nums">{lic.number || '—'}</span>
                      </div>
                    )
                  ))}
                  {editing && (
                    <button onClick={addLicense}
                      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl
                                 border border-dashed border-white/[0.10] text-[11px] text-white/30
                                 hover:text-white/50 hover:border-white/20 transition-colors">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}
                        strokeLinecap="round" className="w-3 h-3">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Add License
                    </button>
                  )}
                </div>
              </div>

              {/* Last medical — pilots only */}
              {isPilot && (
                <div>
                  <p className="text-[10px] text-white/30 mb-1">Last Medical Exam</p>
                  {editing ? (
                    <input type="date" value={draft.lastMedical || ''} onChange={e => set('lastMedical', e.target.value)}
                      className="input-field w-full text-sm" />
                  ) : (
                    <p className="text-sm text-white">{formatDate(draft.lastMedical)}</p>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

// ── Pilot card ─────────────────────────────────────────────────────────────────

function PilotCard({ pilot, onProfileClick }) {
  const [expanded, setExpanded] = useState(false)
  const [showAll,  setShowAll]  = useState(false)

  const visibleFlights = showAll ? pilot.recentFlights : pilot.recentFlights.slice(0, 5)
  const remaining      = pilot.recentFlights.length - 5

  return (
    <div className="card p-0 overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* Tappable avatar */}
        <button
          onClick={onProfileClick}
          className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center
                     flex-shrink-0 active:bg-white/[0.14] transition-colors"
        >
          <span className="text-xs font-bold text-white/60">{initials(pilot.name)}</span>
        </button>

        {/* Name + last flight — taps to expand */}
        <button className="flex-1 min-w-0 text-left" onClick={() => setExpanded(v => !v)}>
          <p className="text-sm font-semibold text-white">{pilot.name}</p>
          <p className="text-[11px] text-white/35 mt-0.5">
            {pilot.lastFlightDate ? `Last flew ${formatDate(pilot.lastFlightDate)}` : 'No flights logged'}
          </p>
        </button>

        {/* Stats + chevron */}
        <button className="flex items-center gap-4 flex-shrink-0" onClick={() => setExpanded(v => !v)}>
          <div className="text-right">
            <p className="text-sm font-bold text-white">{pilot.totalHours.toFixed(1)}h</p>
            <p className="text-[9px] text-white/30 uppercase tracking-wide">Total</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-white">{pilot.monthHours.toFixed(1)}h</p>
            <p className="text-[9px] text-white/30 uppercase tracking-wide">This mo.</p>
          </div>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" className={`w-4 h-4 text-white/20 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {/* Expanded flight history */}
      {expanded && (
        <div className="border-t border-white/[0.05]">
          {pilot.recentFlights.length === 0 ? (
            <p className="text-xs text-white/25 px-4 py-3 text-center">No flights logged yet</p>
          ) : (
            visibleFlights.map((f, i) => (
              <div key={f.id}
                className={`flex items-center justify-between px-4 py-2.5 ${i < visibleFlights.length - 1 ? 'border-b border-white/[0.04]' : ''}`}>
                <div>
                  <p className="text-xs font-medium text-white/70">{flightRoute(f)}</p>
                  <p className="text-[10px] text-white/30 mt-0.5">{formatDate(f.date)}</p>
                </div>
                <p className="text-xs text-white/40 flex-shrink-0 ml-3">
                  {f.displayMins ? `${toHobbs(f.displayMins).toFixed(1)}h` : '—'}
                </p>
              </div>
            ))
          )}
          {!showAll && remaining > 0 && (
            <button
              className="w-full text-[11px] text-white/35 hover:text-white/60 active:text-white/60 text-center py-2.5 border-t border-white/[0.04] transition-colors"
              onClick={() => setShowAll(true)}
            >
              +{remaining} more flights
            </button>
          )}
          {showAll && pilot.recentFlights.length > 5 && (
            <button
              className="w-full text-[11px] text-white/25 hover:text-white/50 text-center py-2.5 border-t border-white/[0.04] transition-colors"
              onClick={() => setShowAll(false)}
            >
              Show less
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Member card (mechanics / operations) ───────────────────────────────────────

function MemberCard({ member, onProfileClick, onCall }) {
  return (
    <div className="card flex items-center gap-3 py-3.5">
      <button
        onClick={onProfileClick}
        className="w-10 h-10 rounded-full bg-white/[0.08] flex items-center justify-center
                   flex-shrink-0 active:bg-white/[0.14] transition-colors"
      >
        <span className="text-xs font-bold text-white/60">{initials(member.name)}</span>
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white">{member.name}</p>
        <p className="text-[11px] text-white/35 mt-0.5">{member.role}</p>
      </div>
      {onCall && (
        <span className="flex-shrink-0 text-[9px] font-bold uppercase tracking-widest
                         bg-white/[0.06] text-white/50 border border-white/[0.10]
                         px-2.5 py-1 rounded-full">
          On Call
        </span>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Employees() {
  const { selectedAircraft } = useAircraft()
  const { pilots, mechanics, operations, loading, dbProfiles, saveProfile } = useEmployeeFlights(selectedAircraft?.id)

  const [profile,    setProfile]    = useState(null)  // { person, isPilot }
  const [saveError,  setSaveError]  = useState(null)

  function getProfile(person) {
    const db = dbProfiles[person.name] || {}
    // DB fields override ROSTER defaults; skip null/undefined DB values
    return {
      ...person,
      ...Object.fromEntries(Object.entries(db).filter(([, v]) => v != null)),
    }
  }

  async function handleSave(updated) {
    setSaveError(null)
    try {
      await saveProfile(updated)
      setProfile(p => ({ ...p, person: updated }))
    } catch (err) {
      setSaveError(err.message)
    }
  }

  function openProfile(person, isPilot) {
    setProfile({ person: getProfile(person), isPilot })
  }

  return (
    <div className="flex-1 overflow-y-auto nav-clearance">
      <div className="px-4 pt-5 pb-2">
        <h1 className="page-title">Team</h1>
        <p className="text-xs text-white/40 mt-0.5">
          {selectedAircraft?.tail_number} · Cielo Norte Aviación
        </p>
      </div>

      <div className="px-4 pb-6 space-y-6">

        {/* Pilots */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="label">Pilots</p>
            <p className="text-[10px] text-white/25">{pilots.length} active</p>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[1,2,3].map(i => <div key={i} className="card h-14 animate-pulse" />)}
            </div>
          ) : (
            <div className="space-y-3">
              {pilots.map(p => (
                <PilotCard
                  key={p.name}
                  pilot={getProfile(p)}
                  onProfileClick={() => openProfile(p, true)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Mechanics */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="label">Mechanics</p>
            <p className="text-[10px] text-white/25">{mechanics.length} active</p>
          </div>
          <div className="space-y-3">
            {mechanics.map(m => (
              <MemberCard
                key={m.name}
                member={getProfile(m)}
                onProfileClick={() => openProfile(m, false)}
                onCall
              />
            ))}
          </div>
        </div>

        {/* Operations */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="label">Operations</p>
            <p className="text-[10px] text-white/25">{operations.length} active</p>
          </div>
          <div className="space-y-3">
            {operations.map(m => (
              <MemberCard
                key={m.name}
                member={getProfile(m)}
                onProfileClick={() => openProfile(m, false)}
              />
            ))}
          </div>
        </div>

      </div>

      {/* Profile modal */}
      {profile && (
        <ProfileModal
          person={profile.person}
          isPilot={profile.isPilot}
          onClose={() => setProfile(null)}
          onSave={updated => { handleSave(updated); setProfile(p => ({ ...p, person: updated })) }}
        />
      )}
    </div>
  )
}
