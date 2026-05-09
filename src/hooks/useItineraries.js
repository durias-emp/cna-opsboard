import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useItineraries() {
  const [itineraries, setItineraries] = useState([])
  const [loading,     setLoading]     = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('flight_itineraries')
      .select('*')
      .order('date',         { ascending: false })
      .order('submitted_at', { ascending: false })
    if (data) setItineraries(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function submit(payload) {
    const { error } = await supabase.from('flight_itineraries').insert([payload])
    if (error) throw error
    await load()
  }

  return { itineraries, loading, submit, refresh: load }
}
