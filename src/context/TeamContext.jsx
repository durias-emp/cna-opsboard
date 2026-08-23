import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { FALLBACK_ROSTER, deriveTeam } from '../lib/roster'

// Single source of truth for "who is on the team".
// Reads team_profiles (name, role, team_group, is_management, is_active, sort_order).
// If the migration hasn't been run yet (no team_group column) or the DB is
// unreachable, falls back to src/lib/roster.js so the app keeps working.

const TeamContext = createContext(null)

function rowsToRoster(rows) {
  const hasGroups = rows.length > 0 && rows.some(r => r.team_group != null)
  if (!hasGroups) return null
  return rows
    .filter(r => r.team_group != null)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
    .map(r => ({
      name:       r.name,
      group:      r.team_group,
      role:       r.role ?? null,
      email:      r.email ?? null,
      management: r.is_management === true,
      active:     r.is_active !== false,
    }))
}

export function TeamProvider({ children }) {
  const [roster,  setRoster]  = useState(FALLBACK_ROSTER)
  const [source,  setSource]  = useState('fallback')   // 'fallback' | 'db'
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('team_profiles').select('*')
    if (!error && data) {
      const fromDb = rowsToRoster(data)
      if (fromDb) { setRoster(fromDb); setSource('db') }
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const value = useMemo(() => ({ ...deriveTeam(roster), source, loading, refresh: load }), [roster, source, loading, load])
  return <TeamContext.Provider value={value}>{children}</TeamContext.Provider>
}

export function useTeam() {
  const ctx = useContext(TeamContext)
  if (!ctx) throw new Error('useTeam must be used inside TeamProvider')
  return ctx
}
