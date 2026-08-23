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
    const max  = can.capacity_gallons ?? Infinity
    if (!Number.isFinite(next) || next < 0 || next > max) {
      throw new Error(`Level must be between 0 and ${max} gal`)
    }
    const previous = can.current_gallons
    setCans(prev => prev.map(c => c.id === can.id ? { ...c, current_gallons: next } : c))
    const { error } = await supabase
      .from('jerry_cans')
      .update({ current_gallons: next })
      .eq('id', can.id)
    if (error) {
      // roll the optimistic update back so the screen never shows a level the DB doesn't have
      setCans(prev => prev.map(c => c.id === can.id ? { ...c, current_gallons: previous } : c))
      throw new Error(error.message)
    }
  }

  const totalCurrentGal  = cans.reduce((s, c) => s + parseFloat(c.current_gallons),  0)
  const totalCapacityGal = cans.reduce((s, c) => s + parseFloat(c.capacity_gallons), 0)

  return { cans, loading, setLevel, totalCurrentGal, totalCapacityGal, refresh: load }
}
