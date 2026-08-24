import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import ca4 from '../data/ca4Aerodromes.json'

// Bundled AIP aerodromes as the pre-migration / offline fallback,
// mapped to the same shape as the waypoints table.
const BUNDLED = ca4.rows.map(([code, lat, lng, , name, elev, kind, country]) => ({
  id: `aip-${code}-${lat}`,
  code: typeof code === 'string' && code.length === 4 && /^[A-Z]{4}$/.test(code) ? code : null,
  name: name || code,
  lat, lng,
  elevation_ft: typeof elev === 'number' ? elev : null,
  kind, country,
  source: 'aip',
  is_active: true,
  bundled: true,            // read-only: not yet a DB row
}))

const TABLE_MISSING = err => err && (err.code === '42P01' || /waypoints/.test(err.message ?? '') && /not exist|schema cache/.test(err.message ?? ''))

export function useWaypoints() {
  const [waypoints, setWaypoints] = useState(BUNDLED)
  const [dbReady,   setDbReady]   = useState(false)   // false until the migration has run
  const [loading,   setLoading]   = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('waypoints').select('*').eq('is_active', true).order('name')
    if (error) {
      if (!TABLE_MISSING(error)) console.error('Waypoints load error:', error.message)
      setWaypoints(BUNDLED)     // bundled AIP set keeps the map useful regardless
      setDbReady(false)
    } else {
      setWaypoints(data)
      setDbReady(true)
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const addWaypoint = useCallback(async wp => {
    const { error } = await supabase.from('waypoints').insert({
      ...wp, source: 'custom', kind: wp.kind ?? 'custom',
      created_by: localStorage.getItem('cna_identity') ?? null,
    })
    if (error) {
      if (TABLE_MISSING(error)) throw new Error('The waypoints table hasn\'t been created yet — run migrations/2026-08-24-waypoints.sql first.')
      throw new Error(error.message)
    }
    await load()
  }, [load])

  const deactivateWaypoint = useCallback(async id => {
    const { error } = await supabase.from('waypoints').update({ is_active: false }).eq('id', id)
    if (error) throw new Error(error.message)
    await load()
  }, [load])

  return { waypoints, dbReady, loading, refresh: load, addWaypoint, deactivateWaypoint }
}
