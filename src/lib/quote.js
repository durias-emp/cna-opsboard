import { haversineNm } from './geo'

// CNA's shipped rules — used when the quote_profiles table isn't reachable.
// The database row is the authority; these only keep the tool working offline.
export const DEFAULT_PROFILE = {
  cruise_kts: 100,
  burn_gph: 27,
  rate_hr: 1350,
  currency: 'USD',
  min_charge: 500,
  standby_free_hr: 1,
  standby_rate_hr: 100,
  tax_included: true,
  round_trip_default: true,
}

// Pure quoting engine: route + profile + adjustments → line-item breakdown.
// Line items are the customization seam — a different operator's profile
// simply lights up different lines.
export function computeQuote({ points, roundTrip = true, waitingHr = 0, profile = DEFAULT_PROFILE }) {
  if (!points || points.length < 2) return null

  let oneWayNm = 0
  for (let i = 1; i < points.length; i++)
    oneWayNm += haversineNm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng)

  // The aircraft must come home: direct return from the last site to the first
  const last = points[points.length - 1], first = points[0]
  const returnNm = roundTrip ? haversineNm(last.lat, last.lng, first.lat, first.lng) : 0

  const totalNm  = oneWayNm + returnNm
  const flightHr = totalNm / profile.cruise_kts
  const fuelGal  = flightHr * profile.burn_gph

  const lines = []
  const flightCost = flightHr * profile.rate_hr
  lines.push({ key: 'flight', label: `Flight ${flightHr.toFixed(1)} h × $${profile.rate_hr.toLocaleString('en-US')}`, amount: flightCost })

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

  const total = flightCost + minTopUp + waitCost

  return { oneWayNm, returnNm, totalNm, flightHr, fuelGal, lines, total }
}
