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

  async function cycleLevel(can) {
    // Full → Half → Empty → Full
    let next
    const cap = parseFloat(can.capacity_gallons)
    const cur = parseFloat(can.current_gallons)

    if (cur >= cap) {
      next = parseFloat((cap / 2).toFixed(1))
    } else if (cur > 0) {
      next = 0.0
    } else {
      next = cap
    }

    // Optimistic update
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

  return { cans, loading, cycleLevel, totalCurrentGal, totalCapacityGal, refresh: load }
}
