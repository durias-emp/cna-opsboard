import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Active NOTAMs from v_notams_active (status=active, still in force).
// Unscored ones come first from the view on purpose: if no rule matched,
// a person looks at it. Only rows with geometry can draw on the chart.
export function useNotams() {
  const [notams, setNotams] = useState([])
  useEffect(() => {
    let cancelled = false
    supabase
      .from('v_notams_active')
      .select('*')
      .then(({ data }) => { if (!cancelled && data) setNotams(data) })
    return () => { cancelled = true }
  }, [])
  return notams
}

// 64-point circle polygon around a center, radius in nautical miles
export function notamCircle(lat, lng, radiusNm) {
  const R = 3440.065
  const d = radiusNm / R
  const latR = (lat * Math.PI) / 180
  const coords = []
  for (let i = 0; i <= 64; i++) {
    const brg = (i / 64) * 2 * Math.PI
    const la = Math.asin(Math.sin(latR) * Math.cos(d) + Math.cos(latR) * Math.sin(d) * Math.cos(brg))
    const lo = (lng * Math.PI) / 180 +
      Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(latR),
                 Math.cos(d) - Math.sin(latR) * Math.sin(la))
    coords.push([(lo * 180) / Math.PI, (la * 180) / Math.PI])
  }
  return coords
}
