import { describe, it, expect } from 'vitest'
import { computeQuote, DEFAULT_PROFILE } from '../src/lib/quote'

// Hand-computed against CNA's rules (2026-08-25): round trip billed,
// $500 minimum, waiting 1 h free then $100/h, $1,350/h all-in.

const SALA = { lat: 13.629528, lng: -89.2535 }     // Salamanca
const FAR  = { lat: 14.3,      lng: -88.2 }        // ~75 nm away

describe('computeQuote', () => {
  it('needs at least two points', () => {
    expect(computeQuote({ points: [SALA] })).toBeNull()
  })

  it('bills the return leg on round trips (out-and-back doubles the distance)', () => {
    const q = computeQuote({ points: [SALA, FAR], roundTrip: true })
    expect(q.returnNm).toBeCloseTo(q.oneWayNm, 5)
    expect(q.totalNm).toBeCloseTo(q.oneWayNm * 2, 5)
  })

  it('one-way skips the return leg', () => {
    const q = computeQuote({ points: [SALA, FAR], roundTrip: false })
    expect(q.returnNm).toBe(0)
    expect(q.totalNm).toBeCloseTo(q.oneWayNm, 5)
  })

  it('applies the $500 minimum to short hops', () => {
    const near = { lat: SALA.lat + 0.05, lng: SALA.lng }   // ~3 nm
    const q = computeQuote({ points: [SALA, near], roundTrip: true })
    expect(q.total).toBe(DEFAULT_PROFILE.min_charge)
    expect(q.lines.some(l => l.key === 'min')).toBe(true)
  })

  it('does not top up when the flight clears the minimum', () => {
    const q = computeQuote({ points: [SALA, FAR], roundTrip: true })
    expect(q.lines.some(l => l.key === 'min')).toBe(false)
    expect(q.total).toBeCloseTo(q.flightHr * DEFAULT_PROFILE.rate_hr, 6)
  })

  it('first waiting hour is free, the rest bill at the standby rate', () => {
    const free = computeQuote({ points: [SALA, FAR], waitingHr: 1 })
    const paid = computeQuote({ points: [SALA, FAR], waitingHr: 3 })
    expect(paid.total - free.total).toBeCloseTo(2 * DEFAULT_PROFILE.standby_rate_hr, 6)
  })

  it('fuel follows the burn rate', () => {
    const q = computeQuote({ points: [SALA, FAR] })
    expect(q.fuelGal).toBeCloseTo(q.flightHr * DEFAULT_PROFILE.burn_gph, 6)
  })
})
