import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Warning thresholds
const WARN_HOURS_STANDARD  = 10   // items with interval < 1500 hrs
const WARN_HOURS_HEAVY     = 50   // items with interval >= 1500 hrs
const WARN_MONTHS          = 1
const WARN_CYCLES          = 50

function monthsRemaining(dueDateStr) {
  if (!dueDateStr) return null
  const due  = new Date(dueDateStr + 'T12:00:00')
  const now  = new Date()
  return (due.getFullYear() - now.getFullYear()) * 12 +
    (due.getMonth() - now.getMonth()) +
    (due.getDate() >= now.getDate() ? 0 : -1)
}

function computeStatus(item, hobbsCurrent, cyclesCurrent) {
  if (item.limit_type === 'ON_CONDITION') return 'on_condition'

  const hrsRemaining   = item.due_at_hours  != null ? item.due_at_hours  - hobbsCurrent  : null
  const cycsRemaining  = item.due_at_cycles != null ? item.due_at_cycles - cyclesCurrent : null
  const mthsRemaining  = item.due_date      != null ? monthsRemaining(item.due_date)     : null

  // OVERDUE: any clock has tripped
  const hoursOverdue  = hrsRemaining  != null && hrsRemaining  <= 0
  const cyclesOverdue = cycsRemaining != null && cycsRemaining <= 0
  const dateOverdue   = mthsRemaining != null && mthsRemaining <  0
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

  return { ...item, status, hrsRemaining, cycsRemaining, mthsRemaining }
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
  const overdue    = enriched.filter(i => i.status === 'overdue')
  const dueSoon    = enriched.filter(i => i.status === 'due_soon')
  const ok         = enriched.filter(i => i.status === 'ok')
  const onCondition= enriched.filter(i => i.status === 'on_condition')

  function byCategory(cat) {
    return enriched.filter(i => i.category === cat)
  }

  return { items: enriched, overdue, dueSoon, ok, onCondition, byCategory, loading, refresh: load }
}
