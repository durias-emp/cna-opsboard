import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// The cost_rates row for the aircraft (Finance Phase 2). Degrades to null
// until the migration runs; save() upserts the single row.
export function useCostRates(aircraftId) {
  const [rates, setRates] = useState(null)
  const [missing, setMissing] = useState(false)   // table not migrated yet
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId) { setLoading(false); return }
    const { data, error } = await supabase
      .from('cost_rates').select('*').eq('aircraft_id', aircraftId).maybeSingle()
    if (error) setMissing(true)
    else { setRates(data); setMissing(false) }
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  const save = useCallback(async (patch) => {
    const { error } = await supabase
      .from('cost_rates')
      .upsert({ aircraft_id: aircraftId, ...patch, updated_at: new Date().toISOString() })
    if (error) return error.message
    await load()
    return null
  }, [aircraftId, load])

  return { rates, missing, loading, save, refresh: load }
}
