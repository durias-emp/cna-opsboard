import { describe, it, expect } from 'vitest'
import { computeQuote, DEFAULT_PROFILE } from '../src/lib/quote'
import { parseCoords } from '../src/lib/geo'

// Hand-computed against CNA's pilot-provided performance (2026-08-25):
// climb 60 kts / 300 fpm, cruise 80 kts, descent 70 kts / 500 fpm, 30 gph all
// phases; air time + 0.2 h start/stop = flight time (what bills at $1,200/h
// pre-IVA, IVA 13% its own line, $400 pre-IVA minimum).

const P = DEFAULT_PROFILE
// Sea-level points laid out on a meridian so distances are exact minutes of arc
const pt = (nmNorth, elev = 0) => ({ lat: nmNorth / 60, lng: -89, elevation_ft: elev })

describe('computeQuote — flight physics', () => {
  it('needs at least two points', () => {
    expect(computeQuote({ points: [pt(0)] })).toBeNull()
  })

  it('one-way 40 nm from sea level at 5,500 ft: climb 18.3 min, descend 11 min, cruise the rest', () => {
    // climb: 5500/300 = 18.33 min at 60 kt → 18.33 nm
    // descent: 5500/500 = 11 min at 70 kt → 12.83 nm
    // cruise: 40 − 31.17 = 8.83 nm at 80 kt → 6.63 min ⇒ air 0.5994 h
    const q = computeQuote({ points: [pt(0), pt(40)], roundTrip: false })
    const s = q.segments[0]
    expect(s.climbHr).toBeCloseTo(5500 / 300 / 60, 6)
    expect(s.descHr).toBeCloseTo(5500 / 500 / 60, 6)
    expect(q.airHr).toBeCloseTo(0.5994, 3)
    expect(q.flightHr).toBeCloseTo(q.airHr + 0.2, 6)
  })

  it('short hops cap the cruise altitude so climb + descent fit the distance', () => {
    const q = computeQuote({ points: [pt(0), pt(10)], roundTrip: false })
    expect(q.segments[0].altFt).toBeLessThan(5500)
    expect(q.segments[0].cruiseHr).toBeCloseTo(0, 3)
  })

  it('site elevations shorten the climb and descent', () => {
    const low  = computeQuote({ points: [pt(0, 0), pt(40, 0)], roundTrip: false })
    const high = computeQuote({ points: [pt(0, 2000), pt(40, 2000)], roundTrip: false })
    expect(high.segments[0].climbHr).toBeCloseTo(3500 / 300 / 60, 6)
    expect(high.airHr).toBeLessThan(low.airHr)
  })

  it('round trip flies the profile twice but the 0.2 h allowance once', () => {
    const one = computeQuote({ points: [pt(0), pt(40)], roundTrip: false })
    const rt  = computeQuote({ points: [pt(0), pt(40)], roundTrip: true })
    expect(rt.airHr).toBeCloseTo(one.airHr * 2, 6)
    expect(rt.flightHr).toBeCloseTo(one.airHr * 2 + 0.2, 6)
  })

  it('a headwind slows the trip, a tailwind speeds it (route runs north, wind from north)', () => {
    const calm = computeQuote({ points: [pt(0), pt(40)], roundTrip: false })
    const head = computeQuote({ points: [pt(0), pt(40)], roundTrip: false, wind: { dirDeg: 0, kts: 15 } })
    const tail = computeQuote({ points: [pt(0), pt(40)], roundTrip: false, wind: { dirDeg: 180, kts: 15 } })
    expect(head.airHr).toBeGreaterThan(calm.airHr)
    expect(tail.airHr).toBeLessThan(calm.airHr)
    expect(head.tailKts).toBeCloseTo(-15, 1)
  })

  it('a round trip in wind pays the headwind more than the tailwind refunds', () => {
    const calm  = computeQuote({ points: [pt(0), pt(40)], roundTrip: true })
    const windy = computeQuote({ points: [pt(0), pt(40)], roundTrip: true, wind: { dirDeg: 0, kts: 15 } })
    expect(windy.airHr).toBeGreaterThan(calm.airHr)
  })

  it('bills flight time, not air time', () => {
    const q = computeQuote({ points: [pt(0), pt(40)], roundTrip: false })
    const flightLine = q.lines.find(l => l.key === 'flight')
    expect(flightLine.amount).toBeCloseTo(q.flightHr * P.rate_hr, 6)
  })

  it('fuel burns 30 gph across the whole flight time', () => {
    const q = computeQuote({ points: [pt(0), pt(40)] })
    expect(q.fuelGal).toBeCloseTo(q.flightHr * 30, 6)
  })

  it('applies the $400 pre-IVA minimum and IVA as its own line', () => {
    const q = computeQuote({ points: [pt(0), pt(3)], roundTrip: false })
    expect(q.subtotal).toBe(P.min_charge)
    expect(q.lines.find(l => l.key === 'iva').amount).toBeCloseTo(400 * 0.13, 6)
    expect(q.total).toBeCloseTo(400 * 1.13, 6)
  })

  it('first waiting hour free, then $100/h pre-IVA', () => {
    const free = computeQuote({ points: [pt(0), pt(40)], waitingHr: 1 })
    const paid = computeQuote({ points: [pt(0), pt(40)], waitingHr: 3 })
    expect(paid.subtotal - free.subtotal).toBeCloseTo(200, 6)
  })
})

describe('parseCoords — every pilot format', () => {
  it('decimal pair', () => {
    expect(parseCoords('13.975, -89.55')).toEqual({ lat: 13.975, lng: -89.55 })
    expect(parseCoords('13.975 -89.55')).toEqual({ lat: 13.975, lng: -89.55 })
  })
  it('DMS with symbols', () => {
    const c = parseCoords(`13°58'30"N 89°33'00"W`)
    expect(c.lat).toBeCloseTo(13.975, 5)
    expect(c.lng).toBeCloseTo(-89.55, 5)
  })
  it('degrees decimal minutes, hemisphere first', () => {
    const c = parseCoords('N13 58.5 W089 33.0')
    expect(c.lat).toBeCloseTo(13.975, 5)
    expect(c.lng).toBeCloseTo(-89.55, 5)
  })
  it('rejects nonsense', () => {
    expect(parseCoords('ilopango')).toBeNull()
    expect(parseCoords('95.1, -89.2')).toBeNull()
    expect(parseCoords('13N 14N')).toBeNull()
  })
})
