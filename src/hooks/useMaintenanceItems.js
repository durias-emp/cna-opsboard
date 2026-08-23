import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

// Warning thresholds
const WARN_HOURS_STANDARD  = 10   // items with interval < 1500 hrs
const WARN_HOURS_HEAVY     = 50   // items with interval >= 1500 hrs
const WARN_MONTHS          = 1
const WARN_CYCLES          = 100

export const STATUS = Object.freeze({
  OVERDUE:        'overdue',
  DUE_SOON:       'due_soon',
  OK:             'ok',
  ON_CONDITION:   'on_condition',
  NOT_APPLICABLE: 'not_applicable',
})

function monthsRemaining(dueDateStr) {
  if (!dueDateStr) return null
  const due = new Date(dueDateStr + 'T12:00:00')
  if (isNaN(due)) return null
  const now = new Date()
  // Simple month count matching the maintenance sheet (no day adjustment)
  return (due.getFullYear() - now.getFullYear()) * 12 +
    (due.getMonth() - now.getMonth())
}

function isDateOverdue(dueDateStr) {
  if (!dueDateStr) return false
  const due = new Date(dueDateStr + 'T12:00:00')
  return !isNaN(due) && due < new Date()
}

// Explicit columns (migrations/2026-08-22-maintenance-status-columns.sql) win.
// Until that migration has been run the columns are undefined and we fall back to
// the legacy note prefixes ("N/A…", "TRACK:acRef:ohRef") so nothing changes on deploy.
function isNotApplicable(item) {
  if (item.is_not_applicable !== undefined) return item.is_not_applicable === true
  return !!item.notes?.startsWith('N/A')
}

function trackRefs(item) {
  if (item.track_ac_ref !== undefined) {
    const acRef = parseFloat(item.track_ac_ref)
    const ohRef = parseFloat(item.track_oh_ref)
    return Number.isFinite(acRef) && Number.isFinite(ohRef) ? { acRef, ohRef } : null
  }
  if (!item.notes?.startsWith('TRACK:')) return null
  const [, acStr, ohStr] = item.notes.split(':')
  const acRef = parseFloat(acStr)
  const ohRef = parseFloat(ohStr)
  if (isNaN(acRef) || isNaN(ohRef)) return null
  return { acRef, ohRef }
}

function computeStatus(item, remaining) {
  if (isNotApplicable(item)) return STATUS.NOT_APPLICABLE
  if (item.limit_type === 'ON_CONDITION') return STATUS.ON_CONDITION

  const { hrsRemaining, cycsRemaining, mthsRemaining } = remaining

  const hoursOverdue  = hrsRemaining  != null && hrsRemaining  <= 0
  const cyclesOverdue = cycsRemaining != null && cycsRemaining <= 0
  const dateOverdue   = isDateOverdue(item.due_date)
  if (hoursOverdue || cyclesOverdue || dateOverdue) return STATUS.OVERDUE

  // Warning band — heavier intervals get a wider window
  const warnHrs = (item.hours_interval != null && item.hours_interval >= 1500)
    ? WARN_HOURS_HEAVY : WARN_HOURS_STANDARD

  const hoursDueSoon  = hrsRemaining  != null && hrsRemaining  <= warnHrs
  const cyclesDueSoon = cycsRemaining != null && cycsRemaining <= WARN_CYCLES
  const dateDueSoon   = mthsRemaining != null && mthsRemaining <= WARN_MONTHS
  if (hoursDueSoon || cyclesDueSoon || dateDueSoon) return STATUS.DUE_SOON

  return STATUS.OK
}

export function enrichItem(item, hobbsCurrent, cyclesCurrent) {
  const hrsRemaining  = item.due_at_hours  != null ? Math.round((item.due_at_hours - hobbsCurrent) * 10) / 10 : null
  const cycsRemaining = item.due_at_cycles != null ? item.due_at_cycles - cyclesCurrent : null
  const mthsRemaining = monthsRemaining(item.due_date)

  const status = computeStatus(item, { hrsRemaining, cycsRemaining, mthsRemaining })

  // Live running totals for ON_CONDITION tracking items
  let trackAcHours = null
  let trackOhHours = null
  const refs = trackRefs(item)
  if (refs && item.last_complied_hours != null) {
    const flownSince = hobbsCurrent - item.last_complied_hours
    trackAcHours = Math.round((refs.acRef + flownSince) * 10) / 10
    trackOhHours = Math.round((refs.ohRef + flownSince) * 10) / 10
  }

  return { ...item, status, hrsRemaining, cycsRemaining, mthsRemaining, trackAcHours, trackOhHours }
}

export function useMaintenanceItems(aircraftId, hobbsCurrent, cyclesCurrent) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)
  const fetchSeq = useRef(0)   // guards against out-of-order responses

  const load = useCallback(async () => {
    if (!aircraftId) { setItems([]); setLoading(false); return }
    const seq = ++fetchSeq.current
    setLoading(true)
    setError(null)

    const { data, error: err } = await supabase
      .from('maintenance_items')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .eq('is_active', true)
      .order('description')

    // A newer request started while this one was in flight — discard this result
    if (seq !== fetchSeq.current) return

    if (err) {
      console.error('Maintenance load error:', err.message)
      setError(err.message)
    } else {
      setItems(data ?? [])
    }
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  // Re-enrich whenever hobbs or cycles change (no DB re-fetch needed)
  const enriched = useMemo(
    () => items.map(i => enrichItem(i, hobbsCurrent ?? 0, cyclesCurrent ?? 0)),
    [items, hobbsCurrent, cyclesCurrent]
  )

  const groups = useMemo(() => ({
    overdue:       enriched.filter(i => i.status === STATUS.OVERDUE),
    dueSoon:       enriched.filter(i => i.status === STATUS.DUE_SOON),
    ok:            enriched.filter(i => i.status === STATUS.OK),
    onCondition:   enriched.filter(i => i.status === STATUS.ON_CONDITION),
    notApplicable: enriched.filter(i => i.status === STATUS.NOT_APPLICABLE),
  }), [enriched])

  const byCategory = useCallback(
    cat => enriched.filter(i => i.category === cat),
    [enriched]
  )

  return { items: enriched, ...groups, byCategory, loading, error, refresh: load }
}
