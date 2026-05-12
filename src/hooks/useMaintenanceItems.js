import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Warning thresholds
const WARN_HOURS_STANDARD  = 10   // items with interval < 1500 hrs
const WARN_HOURS_HEAVY     = 50   // items with interval >= 1500 hrs
const WARN_MONTHS          = 1
const WARN_CYCLES          = 100

function monthsRemaining(dueDateStr) {
  if (!dueDateStr) return null
  const due = new Date(dueDateStr + 'T12:00:00')
  const now = new Date()
  // Simple month count matching the maintenance sheet (no day adjustment)
  return (due.getFullYear() - now.getFullYear()) * 12 +
    (due.getMonth() - now.getMonth())
}

function isDateOverdue(dueDateStr) {
  if (!dueDateStr) return false
  return new Date(dueDateStr + 'T12:00:00') < new Date()
}

function computeStatus(item, hobbsCurrent, cyclesCurrent) {
  if (item.notes?.startsWith('N/A')) return 'not_applicable'
  if (item.limit_type === 'ON_CONDITION') return 'on_condition'

  const hrsRemaining   = item.due_at_hours  != null ? item.due_at_hours  - hobbsCurrent  : null
  const cycsRemaining  = item.due_at_cycles != null ? item.due_at_cycles - cyclesCurrent : null
  const mthsRemaining  = item.due_date      != null ? monthsRemaining(item.due_date)     : null

  // OVERDUE: any clock has tripped (use actual date comparison for calendar items)
  const hoursOverdue  = hrsRemaining  != null && hrsRemaining  <= 0
  const cyclesOverdue = cycsRemaining != null && cycsRemaining <= 0
  const dateOverdue   = item.due_date != null && isDateOverdue(item.due_date)
  if (hoursOverdue || cyclesOverdue || dateOverdue) return 'overdue'

  // Warning band — heavier intervals get a wider window
  const warnHrs = (item.hours_interval != null && item.hours_interval >= 1500)
    ? WARN_HOURS_HEAVY : WARN_HOURS_STANDARD

  const hoursDueSoon  = hrsRemaining  != null && hrsRemaining  <= warnHrs
  const cyclesDueSoon = cycsRemaining != null && cycsRemaining <= WARN_CYCLES
  const dateDueSoon   = mthsRemaining != null && mthsRemaining <= WARN_MONTHS
  if (hoursDueSoon || cyclesDueSoon || dateDueSoon) return 'due_soon'

  return 'ok'
}

function enrichItem(item, hobbsCurrent, cyclesCurrent) {
  const status       = computeStatus(item, hobbsCurrent, cyclesCurrent)
  const hrsRemaining = item.due_at_hours  != null ? Math.round((item.due_at_hours  - hobbsCurrent)  * 10) / 10 : null
  const cycsRemaining= item.due_at_cycles != null ? item.due_at_cycles - cyclesCurrent : null
  const mthsRemaining= item.due_date      != null ? monthsRemaining(item.due_date) : null

  // Live running totals for ON_CONDITION tracking items (notes: "TRACK:acRef:ohRef")
  let trackAcHours = null
  let trackOhHours = null
  if (item.notes?.startsWith('TRACK:') && item.last_complied_hours != null) {
    const parts = item.notes.split(':')
    const acRef = parseFloat(parts[1])
    const ohRef = parseFloat(parts[2])
    const flownSince = hobbsCurrent - item.last_complied_hours
    trackAcHours = Math.round((acRef + flownSince) * 10) / 10
    trackOhHours = Math.round((ohRef + flownSince) * 10) / 10
  }

  return { ...item, status, hrsRemaining, cycsRemaining, mthsRemaining, trackAcHours, trackOhHours }
}

export function useMaintenanceItems(aircraftId, hobbsCurrent, cyclesCurrent) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId) return
    const { data, error } = await supabase
      .from('maintenance_items')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .eq('is_active', true)
      .order('description')

    if (error) { console.error('Maintenance load error:', error.message); return }
    setItems(data ?? [])
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  // Re-enrich whenever hobbs or cycles change (no DB re-fetch needed)
  const enriched = items.map(i => enrichItem(i, hobbsCurrent ?? 0, cyclesCurrent ?? 0))

  // Groups
  const overdue       = enriched.filter(i => i.status === 'overdue')
  const dueSoon       = enriched.filter(i => i.status === 'due_soon')
  const ok            = enriched.filter(i => i.status === 'ok')
  const onCondition   = enriched.filter(i => i.status === 'on_condition')
  const notApplicable = enriched.filter(i => i.status === 'not_applicable')

  function byCategory(cat) {
    return enriched.filter(i => i.category === cat)
  }

  return { items: enriched, overdue, dueSoon, ok, onCondition, notApplicable, byCategory, loading, refresh: load }
}
