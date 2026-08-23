import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { selectLive } from '../lib/softDelete'
import { toHobbs, round2 } from '../lib/utils'

export function useFlights(aircraftId) {
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId || aircraftId === 'local-1') {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await selectLive(filtered => {
      const q = supabase.from('flights').select('*').eq('aircraft_id', aircraftId).order('date', { ascending: false })
      return filtered ? q.is('deleted_at', null) : q
    })

    if (!error && data) setFlights(data)
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  // ── This-month stats ───────────────────────────────────────────
  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const thisMonth    = flights.filter(f => f.date >= monthStart)
  const monthMinutes = thisMonth.reduce((s, f) => s + (f.total_minutes || 0), 0)

  // ── Fuel stats (all flights with fuel data) ────────────────────
  const fuelFlights = flights.filter(
    f => f.fuel_consumed_gal != null && f.total_minutes > 0
  )

  // Total fuel burned across all logged flights
  const totalFuelGal = fuelFlights.reduce((s, f) => s + (f.fuel_consumed_gal || 0), 0)

  // Average gal/h (weighted by hours flown)
  const totalHours = fuelFlights.reduce((s, f) => s + f.total_minutes / 60, 0)
  const avgGalPerHour = totalHours > 0 ? round2(totalFuelGal / totalHours) : null

  // This-month fuel
  const monthFuelFlights  = thisMonth.filter(f => f.fuel_consumed_gal != null)
  const monthFuelGal      = monthFuelFlights.reduce((s, f) => s + (f.fuel_consumed_gal || 0), 0)

  // Per-flight gal/h for sparkline (last 10, oldest→newest)
  const rateHistory = fuelFlights
    .slice(0, 10)
    .reverse()
    .map(f => ({
      date:            f.date,
      consumed:        f.fuel_consumed_gal,
      hours:           round2(f.total_minutes / 60),
      galPerHour:      round2(f.fuel_consumed_gal / (f.total_minutes / 60)),
      fuel_start_gal:  f.fuel_start_gal,
      fuel_end_gal:    f.fuel_end_gal,
    }))

  return {
    flights,
    loading,
    refresh: load,
    stats: {
      total:      flights.length,
      monthCount: thisMonth.length,
      monthMinutes,
      monthHours: monthMinutes > 0 ? `${toHobbs(monthMinutes).toFixed(1)}h` : '0h',
      allMinutes: flights.reduce((s, f) => s + (f.total_minutes || 0), 0),
      allHours:   (() => { const m = flights.reduce((s, f) => s + (f.total_minutes || 0), 0); return m > 0 ? `${toHobbs(m).toFixed(1)}h` : '0h' })(),
    },
    fuelStats: {
      flightCount:  fuelFlights.length,
      totalGal:     round2(totalFuelGal),
      avgGalPerHour,
      monthGal:     round2(monthFuelGal),
      rateHistory,
    },
  }
}
