import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AircraftContext = createContext(null)

export function AircraftProvider({ children }) {
  const [aircraft, setAircraft] = useState([])
  const [selectedAircraft, setSelectedAircraftState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)   // string when the server can't be reached

  const loadAircraft = useCallback(async () => {
    setError(null)
    const { data, error: err } = await supabase
      .from('aircraft')
      .select('*')
      .order('tail_number')

    if (err) {
      // No fake fallback aircraft: showing stale hours would be worse than showing nothing.
      console.error('Failed to load aircraft:', err.message)
      setError(err.message)
    } else if (data && data.length > 0) {
      setAircraft(data)
      // Prefer the previously selected aircraft, then YS-CNA, then first in list.
      const next = data.find(a => a.id === selectedAircraft?.id)
        ?? data.find(a => a.tail_number === 'YS-CNA')
        ?? data[0]
      setSelectedAircraftState(next)
    } else {
      setError('No aircraft found in the database.')
    }

    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAircraft() }, [loadAircraft])

  // Called after any mutation that changes hobbs or aircraft data
  const refreshAircraft = useCallback(() => loadAircraft(), [loadAircraft])

  return (
    <AircraftContext.Provider value={{
      aircraft,
      selectedAircraft,
      setSelectedAircraft: setSelectedAircraftState,
      loading,
      error,
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
