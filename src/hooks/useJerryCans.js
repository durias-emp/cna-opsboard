import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useJerryCans() {
  const [cans,    setCans]    = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('jerry_cans')
      .select('*')
      .order('id')
    if (data) setCans(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function setLevel(can, gallons) {
    const next = parseFloat(gallons)
    setCans(prev =>
      prev.map(c => c.id === can.id ? { ...c, current_gallons: next } : c)
    )
    await supabase
      .from('jerry_cans')
      .update({ current_gallons: next })
      .eq('id', can.id)
  }

  const totalCurrentGal  = cans.reduce((s, c) => s + parseFloat(c.current_gallons),  0)
  const totalCapacityGal = cans.reduce((s, c) => s + parseFloat(c.capacity_gallons), 0)

  return { cans, loading, setLevel, totalCurrentGal, totalCapacityGal, refresh: load }
}
