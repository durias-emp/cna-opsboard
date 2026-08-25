import { describe, it, expect } from 'vitest'
import { computeQuote, DEFAULT_PROFILE } from '../src/lib/quote'

// Hand-computed against CNA's rules (2026-08-25): round trip billed,
// $1,200/h base + IVA 13% as its own line (= $1,356/h effective),
// $400 pre-IVA minimum (= 20 min at $1,200/h), waiting 1 h free then $100/h pre-IVA.

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

  it('applies the 20-minute minimum to short hops ($400 pre-IVA, $452 total)', () => {
    const near = { lat: SALA.lat + 0.05, lng: SALA.lng }   // ~3 nm
    const q = computeQuote({ points: [SALA, near], roundTrip: true })
    expect(DEFAULT_PROFILE.min_charge).toBeCloseTo((20 / 60) * DEFAULT_PROFILE.rate_hr, 0)
    expect(q.subtotal).toBe(DEFAULT_PROFILE.min_charge)
    expect(q.total).toBeCloseTo(400 * 1.13, 6)   // $452
    expect(q.lines.some(l => l.key === 'min')).toBe(true)
  })

  it('a half-hour flight prices as half the effective hourly (Diego check: $678)', () => {
    // synthetic profile-independent check: force 0.5 h by distance = 25 nm one-way round trip
    const q = computeQuote({ points: [SALA, { lat: SALA.lat + 25 / 60, lng: SALA.lng }], roundTrip: true })
    expect(q.flightHr).toBeCloseTo(50 / 100, 2)
    expect(q.total).toBeCloseTo(0.5 * 1200 * 1.13, 0)   // ≈ $678
  })

  it('IVA appears as its own line at 13% of the subtotal', () => {
    const q = computeQuote({ points: [SALA, FAR], waitingHr: 3 })
    const iva = q.lines.find(l => l.key === 'iva')
    expect(iva).toBeTruthy()
    expect(iva.amount).toBeCloseTo(q.subtotal * 0.13, 6)
    expect(q.total).toBeCloseTo(q.subtotal * 1.13, 6)
  })

  it('does not top up when the flight clears the minimum', () => {
    const q = computeQuote({ points: [SALA, FAR], roundTrip: true })
    expect(q.lines.some(l => l.key === 'min')).toBe(false)
    expect(q.subtotal).toBeCloseTo(q.flightHr * DEFAULT_PROFILE.rate_hr, 6)
  })

  it('first waiting hour is free, the rest bill at the standby rate', () => {
    const free = computeQuote({ points: [SALA, FAR], waitingHr: 1 })
    const paid = computeQuote({ points: [SALA, FAR], waitingHr: 3 })
    expect(paid.subtotal - free.subtotal).toBeCloseTo(2 * DEFAULT_PROFILE.standby_rate_hr, 6)
  })

  it('fuel follows the burn rate', () => {
    const q = computeQuote({ points: [SALA, FAR] })
    expect(q.fuelGal).toBeCloseTo(q.flightHr * DEFAULT_PROFILE.burn_gph, 6)
  })
})
