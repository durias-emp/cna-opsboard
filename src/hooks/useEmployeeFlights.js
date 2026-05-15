import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ROSTER = {
  pilots: [
    { name: 'James McBride' },
    { name: 'Jay McMackin' },
    { name: 'Daniel Sandoval' },
  ],
  mechanics: [
    { name: 'Cesar Espinoza',  role: 'Aircraft Mechanic' },
    { name: 'Antony Villalta', role: 'Aircraft Mechanic' },
    { name: 'Luis Soriano',    role: 'Aircraft Mechanic' },
  ],
}

const toHobbs = mins => Math.floor(mins / 6) / 10

export function useEmployeeFlights(aircraftId) {
  const [flights, setFlights] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!aircraftId) { setLoading(false); return }
    supabase
      .from('flights')
      .select('id, date, pilot, total_minutes, legs')
      .eq('aircraft_id', aircraftId)
      .order('date', { ascending: false })
      .then(({ data }) => {
        setFlights(data ?? [])
        setLoading(false)
      })
  }, [aircraftId])

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const pilots = ROSTER.pilots.map(p => {
    const myFlights = flights.filter(f => f.pilot === p.name)
    const totalMins = myFlights.reduce((s, f) => s + (f.total_minutes || 0), 0)
    const monthMins = myFlights.filter(f => f.date >= monthStart).reduce((s, f) => s + (f.total_minutes || 0), 0)
    const lastFlight = myFlights[0] ?? null
    return {
      ...p,
      totalHours: toHobbs(totalMins),
      monthHours: toHobbs(monthMins),
      flightCount: myFlights.length,
      lastFlightDate: lastFlight?.date ?? null,
      recentFlights: myFlights.slice(0, 5),
    }
  })

  return { pilots, mechanics: ROSTER.mechanics, loading }
}
