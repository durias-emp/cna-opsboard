import { useEffect, useState } from 'react'

// Winds aloft for the route, from Open-Meteo (free, no key): current-hour wind
// at the pressure level nearest the cruise altitude, sampled at the route's
// midpoint. Good enough to bias groundspeeds; not a substitute for a briefing.
function levelFor(altFt) {
  if (altFt <= 3500) return '925hPa'   // ≈ 2,500 ft
  if (altFt <= 7500) return '850hPa'   // ≈ 5,000 ft
  return '700hPa'                      // ≈ 10,000 ft
}

export function useRouteWinds(points, cruiseAltFt) {
  const [wind, setWind] = useState(null)   // { kts, dirDeg, level } | null

  const mid = points.length >= 2 ? points[Math.floor(points.length / 2)] : null
  const key = mid ? `${mid.lat.toFixed(2)},${mid.lng.toFixed(2)},${levelFor(cruiseAltFt)}` : null

  useEffect(() => {
    if (!key || !mid) { setWind(null); return }
    let cancelled = false
    const lvl = levelFor(cruiseAltFt)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${mid.lat}&longitude=${mid.lng}` +
      `&hourly=wind_speed_${lvl},wind_direction_${lvl}&wind_speed_unit=kn&forecast_days=1&timezone=auto`
    const t = setTimeout(() => {
      fetch(url)
        .then(r => r.json())
        .then(d => {
          if (cancelled) return
          const hour = new Date().getHours()
          const kts = d?.hourly?.[`wind_speed_${lvl}`]?.[hour]
          const dirDeg = d?.hourly?.[`wind_direction_${lvl}`]?.[hour]
          setWind(kts != null && dirDeg != null ? { kts, dirDeg, level: lvl } : null)
        })
        .catch(() => { if (!cancelled) setWind(null) })
    }, 400)   // debounce while the route is being built
    return () => { cancelled = true; clearTimeout(t) }
  }, [key])   // eslint-disable-line react-hooks/exhaustive-deps

  return wind
}
