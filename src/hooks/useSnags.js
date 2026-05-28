import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useSnags(aircraftId) {
  const [snags,   setSnags]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId || aircraftId === 'local-1') { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('snags')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .order('date', { ascending: false })

    if (!error && data) setSnags(data)
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  const open       = snags.filter(s => s.status === 'open')
  const inProgress = snags.filter(s => s.status === 'in_progress')
  const resolved   = snags.filter(s => s.status === 'resolved')

  return { snags, open, inProgress, resolved, loading, refresh: load }
}
