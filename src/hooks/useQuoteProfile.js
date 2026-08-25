import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEFAULT_PROFILE } from '../lib/quote'

// The aircraft's quoting rules from quote_profiles, falling back to CNA's
// shipped defaults if the table doesn't exist yet (42P01) or the fetch fails —
// the same graceful pattern as useWaypoints.
export function useQuoteProfile(aircraftId) {
  const [profile, setProfile] = useState(DEFAULT_PROFILE)

  useEffect(() => {
    if (!aircraftId || aircraftId === 'local-1') return
    let cancelled = false
    supabase
      .from('quote_profiles')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        setProfile({
          ...DEFAULT_PROFILE,
          ...Object.fromEntries(
            Object.entries(data).filter(([k, v]) => k in DEFAULT_PROFILE && v != null)
              .map(([k, v]) => [k, typeof DEFAULT_PROFILE[k] === 'boolean' ? !!v : (typeof DEFAULT_PROFILE[k] === 'string' ? v : Number(v))])
          ),
        })
      })
    return () => { cancelled = true }
  }, [aircraftId])

  return profile
}
