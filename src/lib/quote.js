import { haversineNm, initialBearingDeg } from './geo'

// CNA's shipped rules — used when the quote_profiles table isn't reachable.
// The database row is the authority; these only keep the tool working offline.
// Performance numbers from CNA's pilot (2026-08-25).
export const DEFAULT_PROFILE = {
  climb_kts: 60,
  climb_fpm: 300,
  cruise_kts: 80,
  descent_kts: 70,
  descent_fpm: 500,
  burn_gph: 30,             // all phases burn 30
  default_cruise_alt_ft: 5500,
  airtime_allowance_hr: 0.2, // engine start/stop + deviations + pre-landing checks
  rate_hr: 1200,            // pre-IVA — the factura base (1,200 × 1.13 = 1,356/h)
  currency: 'USD',
  min_charge: 400,          // pre-IVA floor = 20 min at $1,200/h
  standby_free_hr: 1,
  standby_rate_hr: 100,     // pre-IVA
  tax_rate: 0.13,           // IVA, its own line
  tax_included: false,
  round_trip_default: true,
}

// One flight segment (engine start → landing): climb at 60 kts / 300 fpm,
// cruise at 80 kts, descend at 70 kts / 500 fpm — all at 30 gph. Wind is a
// distance-weighted average head/tail component along the route, applied to
// every phase's groundspeed. Short hops cap the altitude so climb + descent
// exactly fit the distance.
function flySegment(points, cruiseAltFt, profile, wind) {
  let distNm = 0, weighted = 0
  for (let i = 1; i < points.length; i++) {
    const d = haversineNm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
    distNm += d
    if (wind && wind.kts > 0) {
      const track = initialBearingDeg(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)
      // wind.dirDeg is the direction the wind blows FROM
      weighted += d * (-wind.kts * Math.cos(((wind.dirDeg - track) * Math.PI) / 180))
    }
  }
  if (distNm === 0) return null
  const tail = weighted / distNm                    // + = tailwind, − = headwind

  const gs = tas => Math.max(tas + tail, 20)        // never model below 20 kt over ground
  const depElev  = points[0].elevation_ft ?? 0
  const destElev = points[points.length - 1].elevation_ft ?? 0

  // nm consumed per foot of climb/descent at wind-adjusted groundspeeds
  const aClimb = gs(profile.climb_kts)   / (60 * profile.climb_fpm)
  const aDesc  = gs(profile.descent_kts) / (60 * profile.descent_fpm)

  // Cap altitude if the leg is too short for full climb + descent
  let alt = Math.max(cruiseAltFt, Math.max(depElev, destElev) + 300)
  const fullProfileNm = aClimb * (alt - depElev) + aDesc * (alt - destElev)
  if (fullProfileNm > distNm) {
    alt = (distNm + aClimb * depElev + aDesc * destElev) / (aClimb + aDesc)
  }

  const climbFt = Math.max(0, alt - depElev)
  const descFt  = Math.max(0, alt - destElev)
  const climbHr = climbFt / profile.climb_fpm / 60
  const descHr  = descFt / profile.descent_fpm / 60
  const climbNm = climbHr * gs(profile.climb_kts)
  const descNm  = descHr * gs(profile.descent_kts)
  const cruiseNm = Math.max(0, distNm - climbNm - descNm)
  const cruiseHr = cruiseNm / gs(profile.cruise_kts)

  return {
    distNm,
    airHr: climbHr + cruiseHr + descHr,
    climbHr, cruiseHr, descHr,
    altFt: Math.round(alt),
    tailKts: tail,
  }
}

// Pure quoting engine: route + profile + adjustments → line-item breakdown.
// Air time comes from the climb/cruise/descent model; flight time (what
// bills) adds the 0.2 h start/stop allowance. Line items are the
// customization seam.
export function computeQuote({
  points, roundTrip = true, waitingHr = 0,
  cruiseAltFt, wind = null,
  profile = DEFAULT_PROFILE,
}) {
  if (!points || points.length < 2) return null
  const alt = cruiseAltFt ?? profile.default_cruise_alt_ft

  const segments = [flySegment(points, alt, profile, wind)]
  if (roundTrip) {
    const back = [...points].reverse()
    segments.push(flySegment(back, alt, profile, wind))
  }
  const segs = segments.filter(Boolean)
  if (!segs.length) return null

  const airHr    = segs.reduce((s, x) => s + x.airHr, 0)
  const totalNm  = segs.reduce((s, x) => s + x.distNm, 0)
  const flightHr = airHr + profile.airtime_allowance_hr
  const fuelGal  = flightHr * profile.burn_gph
  const tailKts  = segs.reduce((s, x) => s + x.tailKts * x.distNm, 0) / totalNm

  const lines = []
  const flightCost = flightHr * profile.rate_hr
  lines.push({
    key: 'flight',
    label: `Flight ${flightHr.toFixed(1)} h × $${profile.rate_hr.toLocaleString('en-US')}/h`,
    amount: flightCost,
  })

  let minTopUp = 0
  if (flightCost > 0 && flightCost < profile.min_charge) {
    minTopUp = profile.min_charge - flightCost
    lines.push({ key: 'min', label: `Minimum charge ($${profile.min_charge.toLocaleString('en-US')})`, amount: minTopUp })
  }

  let waitCost = 0
  if (waitingHr > 0) {
    const billable = Math.max(0, waitingHr - profile.standby_free_hr)
    waitCost = billable * profile.standby_rate_hr
    lines.push({
      key: 'wait',
      label: billable > 0
        ? `Waiting ${waitingHr} h (${profile.standby_free_hr} h free) × $${profile.standby_rate_hr}`
        : `Waiting ${waitingHr} h — within free hour`,
      amount: waitCost,
    })
  }

  // IVA as its own line — flight math and tax never mix (Diego, 2026-08-25)
  const subtotal = flightCost + minTopUp + waitCost
  let iva = 0
  const taxRate = profile.tax_rate ?? 0
  if (!profile.tax_included && taxRate > 0 && subtotal > 0) {
    iva = subtotal * taxRate
    lines.push({ key: 'iva', label: `IVA ${Math.round(taxRate * 100)}%`, amount: iva })
  }
  const total = subtotal + iva

  return {
    totalNm, airHr, flightHr, fuelGal, lines, subtotal, total,
    altFt: segs[0].altFt, tailKts,
    segments: segs,
  }
}
