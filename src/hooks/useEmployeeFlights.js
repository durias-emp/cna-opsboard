import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { toHobbs } from '../lib/utils'
import { useTeam } from '../context/TeamContext'
import { selectLive } from '../lib/softDelete'

// The roster (names, groups, roles) comes from TeamContext — one source of truth.
// This hook adds flight statistics and the PII profile fields from team_profiles.

// Convert DB row (snake_case) → app shape (camelCase)
function dbToProfile(row) {
  return {
    dob:         row.dob         ?? null,
    startDate:   row.start_date  ?? null,
    phone:       row.phone       ?? null,
    licenses:    row.licenses    ?? null,
    lastMedical: row.last_medical ?? null,
    role:        row.role        ?? null,
  }
}

export function useEmployeeFlights(aircraftId) {
  const team = useTeam()
  const [flights,    setFlights]    = useState([])
  const [dbProfiles, setDbProfiles] = useState({}) // keyed by name
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    const flightsQ = aircraftId
      ? selectLive(filtered => {
          const q = supabase.from('flights').select('id, date, pilot, copilot, total_minutes, flight_time_minutes, legs').eq('aircraft_id', aircraftId).order('date', { ascending: false })
          return filtered ? q.is('deleted_at', null) : q
        })
      : Promise.resolve({ data: [] })

    const profilesQ = supabase.from('team_profiles').select('*')

    Promise.all([flightsQ, profilesQ]).then(([flightsRes, profilesRes]) => {
      setFlights(flightsRes.data ?? [])
      const map = {}
      ;(profilesRes.data ?? []).forEach(row => { map[row.name] = dbToProfile(row) })
      setDbProfiles(map)
      setLoading(false)
    })
  }, [aircraftId])

  const saveProfile = useCallback(async (person) => {
    const payload = {
      name:         person.name,
      role:         person.role         || null,
      dob:          person.dob          || null,
      start_date:   person.startDate    || null,
      phone:        person.phone        || null,
      licenses:     person.licenses     || null,
      last_medical: person.lastMedical  || null,
      updated_at:   new Date().toISOString(),
    }
    const { error } = await supabase.from('team_profiles').upsert(payload, { onConflict: 'name' })
    if (error) throw error
    setDbProfiles(prev => ({ ...prev, [person.name]: dbToProfile(payload) }))
  }, [])

  const now = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  // For each flight, use flight_time_minutes (pilot logbook time) if recorded,
  // otherwise fall back to total_minutes (air time) for older flights
  const effectiveMins = f => f.flight_time_minutes ?? f.total_minutes ?? 0

  const pilots = team.pilots.map(p => {
    const myFlights = flights.filter(f => f.pilot === p.name || f.copilot === p.name)
    const totalMins = myFlights.reduce((s, f) => s + effectiveMins(f), 0)
    const monthMins = myFlights.filter(f => f.date >= monthStart).reduce((s, f) => s + effectiveMins(f), 0)
    const lastFlight = myFlights[0] ?? null
    return {
      ...p,
      totalHours:    toHobbs(totalMins),
      monthHours:    toHobbs(monthMins),
      flightCount:   myFlights.length,
      lastFlightDate: lastFlight?.date ?? null,
      recentFlights: myFlights.map(f => ({
        ...f,
        displayMins: effectiveMins(f),
        role: f.pilot === p.name ? 'PIC' : 'SIC',
      })),
    }
  })

  return { pilots, mechanics: team.mechanics, operations: team.operations, loading, dbProfiles, saveProfile }
}
