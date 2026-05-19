import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ROSTER = {
  pilots: [
    {
      name:        'James McBride',
      dob:         '2001-01-15',
      startDate:   '2022-01-01',
      phone:       '7045-8200',
      licenses:    [
        { label: 'Canadian',    number: '850255' },
        { label: 'Salvadorean', number: '223' },
      ],
      lastMedical: '2025-11-28',
    },
    {
      name:        'Jay McMackin',
      dob:         '1982-08-15',
      startDate:   '2021-03-01',
      phone:       '7045-8200',
      licenses:    [{ label: 'Canadian', number: '——' }],
      lastMedical: '2025-06-15',
    },
    {
      name:        'Daniel Sandoval',
      dob:         '1990-11-20',
      startDate:   '2023-01-15',
      phone:       '7045-8200',
      licenses:    [{ label: 'Salvadorean', number: '——' }],
      lastMedical: '2025-03-20',
    },
  ],
  mechanics: [
    { name: 'Cesar Espinoza',  role: 'Aircraft Mechanic', dob: '1988-04-10', startDate: '2019-06-01', phone: '7045-8200', licenses: [{ label: 'Mechanic', number: '1087' }] },
    { name: 'Antony Villalta', role: 'Aircraft Mechanic', dob: '1991-07-22', startDate: '2020-11-01', phone: '7045-8200', licenses: [{ label: 'Mechanic', number: '0000' }] },
    { name: 'Luis Soriano',    role: 'Aircraft Mechanic', dob: '1995-03-08', startDate: '2022-03-01', phone: '7045-8200', licenses: [{ label: 'Mechanic', number: '1047' }] },
  ],
  operations: [
    { name: 'Javier Ascensio', role: 'Head Regulator',       dob: '1975-05-12', startDate: '2018-01-01', phone: '7045-8200' },
    { name: 'Alonia Ascensio', role: 'Assistant Regulator',  dob: '1980-09-25', startDate: '2019-04-01', phone: '7045-8200' },
    { name: 'Diego Urias',     role: 'Operations',           dob: '1993-12-03', startDate: '2023-08-01', phone: '7045-8200' },
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
      .select('id, date, pilot, copilot, total_minutes, legs')
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
    // Count flights where pilot is PIC or Co-Pilot
    const myFlights = flights.filter(f => f.pilot === p.name || f.copilot === p.name)
    const totalMins = myFlights.reduce((s, f) => s + (f.total_minutes || 0), 0)
    const monthMins = myFlights.filter(f => f.date >= monthStart).reduce((s, f) => s + (f.total_minutes || 0), 0)
    const lastFlight = myFlights[0] ?? null
    return {
      ...p,
      totalHours: toHobbs(totalMins),
      monthHours: toHobbs(monthMins),
      flightCount: myFlights.length,
      lastFlightDate: lastFlight?.date ?? null,
      recentFlights: myFlights.map(f => ({
        ...f,
        role: f.pilot === p.name ? 'PIC' : 'SIC',
      })),
    }
  })

  return { pilots, mechanics: ROSTER.mechanics, operations: ROSTER.operations, loading }
}
