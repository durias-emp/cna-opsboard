import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { seedAircraft } from '../lib/seed'

const AircraftContext = createContext(null)

export function AircraftProvider({ children }) {
  const [aircraft, setAircraft] = useState([])
  const [selectedAircraft, setSelectedAircraftState] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadAircraft = useCallback(async () => {
    await seedAircraft()

    const { data, error } = await supabase
      .from('aircraft')
      .select('*')
      .order('tail_number')

    if (error) {
      console.error('Failed to load aircraft:', error.message)
      const fallback = {
        id: 'local-1',
        tail_number: 'C-GOPF',
        make_model: 'Bell 206B3 JetRanger',
        hobbs_current: 17502.8,
      }
      setAircraft([fallback])
      setSelectedAircraftState(fallback)
    } else if (data && data.length > 0) {
      setAircraft(data)
      // Keep selected aircraft in sync after refresh
      setSelectedAircraftState(prev =>
        prev ? (data.find(a => a.id === prev.id) ?? data[0]) : data[0]
      )
    }

    setLoading(false)
  }, [])

  useEffect(() => { loadAircraft() }, [loadAircraft])

  // Called after any mutation that changes hobbs or aircraft data
  const refreshAircraft = useCallback(() => loadAircraft(), [loadAircraft])

  return (
    <AircraftContext.Provider value={{
      aircraft,
      selectedAircraft,
      setSelectedAircraft: setSelectedAircraftState,
      loading,
      refreshAircraft,
    }}>
      {children}
    </AircraftContext.Provider>
  )
}

export function useAircraft() {
  const ctx = useContext(AircraftContext)
  if (!ctx) throw new Error('useAircraft must be used inside AircraftProvider')
  return ctx
}
