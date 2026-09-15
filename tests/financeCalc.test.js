import { describe, it, expect } from 'vitest'
import {
  splitEntry, fuelRatePerHour, pilotRatePerHour, reservePerHour,
  variablePerHour, trailingAnnualHours, fixedPerHour, fullyLoadedPerHour,
  costOfFlight, marginOfFlight, breakevenHoursMonth, ivaOwed, ivaRecoverable,
  reserveVsActual,
} from '../src/lib/financeCalc.js'

describe('splitEntry (13/113 at entry, once)', () => {
  it('splits a gross figure', () => {
    // Monies row b01: 8859.20 gross -> 1019.20 IVA, 7840.00 net
    expect(splitEntry(8859.20, true)).toEqual({ amount_net: 7840.00, iva_amount: 1019.20 })
  })
  it('passes net figures through untouched', () => {
    expect(splitEntry(100, false)).toEqual({ amount_net: 100, iva_amount: 0 })
  })
  it('handles junk', () => {
    expect(splitEntry(NaN, true)).toEqual({ amount_net: 0, iva_amount: 0 })
  })
})

describe('fuelRatePerHour', () => {
  const purchases = [{ gallons: 100, costNet: 600 }, { gallons: 50, costNet: 330 }] // avg 6.20/gal
  it('weighted price times logged burn', () => {
    expect(fuelRatePerHour({
      purchases,
      flights: [{ airHours: 6, fuelGal: 162 }],   // 27 gph over enough hours
      profileBurnGph: 20,
    })).toBe(167.40)                              // 6.20 * 27
  })
  it('falls back to profile burn when logged burn is thin', () => {
    expect(fuelRatePerHour({ purchases, flights: [{ airHours: 1, fuelGal: 30 }], profileBurnGph: 27 }))
      .toBe(167.40)
  })
  it('falls back to the configured price with no purchases', () => {
    expect(fuelRatePerHour({ purchases: [], flights: [], fallbackPriceGal: 6.5, profileBurnGph: 27 }))
      .toBe(175.50)
  })
  it('null when nothing to stand on', () => {
    expect(fuelRatePerHour({})).toBe(null)
  })
})

describe('pilotRatePerHour', () => {
  it('hourly wins (CNA: 100 net)', () => {
    expect(pilotRatePerHour({ rate_hr: 100 })).toBe(100)
  })
  it('monthly path needs hours', () => {
    expect(pilotRatePerHour({ monthly: 3000, monthlyHours: 25 })).toBe(120)
    expect(pilotRatePerHour({ monthly: 3000 })).toBe(null)
  })
})

describe('reservePerHour', () => {
  it('hours items divide by their interval; zero is valid; null skips', () => {
    expect(reservePerHour([
      { estimated_cost: 3000, hours_interval: 300 },   // 10/hr
      { estimated_cost: 0,    hours_interval: 100 },   // 0/hr, deliberate
      { estimated_cost: null, hours_interval: 100 },   // not tracked
    ])).toBe(10)
  })
  it('calendar items use expected hours in the interval', () => {
    expect(reservePerHour(
      [{ estimated_cost: 1200, calendar_interval_months: 12 }],
      { monthlyUtilizationHours: 10 },                 // 120 h/interval -> 10/hr
    )).toBe(10)
  })
  it('calendar items without utilization contribute nothing', () => {
    expect(reservePerHour([{ estimated_cost: 1200, calendar_interval_months: 12 }])).toBe(0)
  })
})

describe('trailing utilization and fixed allocation', () => {
  const m = h => ({ month: 'x', hours: h })
  it('12+ months: trailing 12 as-is', () => {
    const months = Array(14).fill(0).map(() => m(10))
    expect(trailingAnnualHours(months)).toEqual({ hours: 120, annualized: false, months: 12 })
  })
  it('6 months: annualized and flagged (the sparse-history case)', () => {
    const months = [m(10), m(12), m(8), m(10), m(11), m(9)]                 // 60 over 6
    expect(trailingAnnualHours(months)).toEqual({ hours: 120, annualized: true, months: 6 })
  })
  it('under 3 months: refuses to guess', () => {
    expect(trailingAnnualHours([m(10), m(12)]).hours).toBe(null)
  })
  it('fixedPerHour divides annual fixed by trailing hours', () => {
    expect(fixedPerHour({ annualFixed: 24000, trailingHours: 120 })).toBe(200)
    expect(fixedPerHour({ annualFixed: 24000, trailingHours: 0 })).toBe(null)
  })
})

describe('flight economics', () => {
  it('fully loaded, cost and margin', () => {
    expect(fullyLoadedPerHour({ variableRate: 300, fixedRate: 200 })).toBe(500)
    expect(costOfFlight({ airTimeHours: 1.5, variableRate: 300, fixedRate: 200 })).toBe(750)
    expect(marginOfFlight({ priceNet: 1350, cost: 750 })).toBe(600)
    expect(marginOfFlight({ priceNet: null, cost: 750 })).toBe(null)   // no price recorded
  })
  it('breakeven hours per month', () => {
    expect(breakevenHoursMonth({ fixedMonthly: 2000, targetRateNet: 1350, variableRate: 350 })).toBe(2)
    expect(breakevenHoursMonth({ fixedMonthly: 2000, targetRateNet: 300, variableRate: 350 })).toBe(Infinity)
    expect(breakevenHoursMonth({ fixedMonthly: 2000 })).toBe(null)
  })
})

describe('IVA from stored iva_amount (never recomputed)', () => {
  const txs = [
    { date: '2026-03-04', amount_net: 7840.00, iva_amount: 1019.20 },
    { date: '2026-03-10', amount_net: -472.00, iva_amount: 0, iva_recoverable: false },
    { date: '2026-03-15', amount_net: -100.00, iva_amount: 13.00, iva_recoverable: true },
    { date: '2026-03-20', amount_net: -500.00, iva_amount: 0, is_iva_payment: true },
    { date: '2026-04-01', amount_net: 2035.40, iva_amount: 264.60 },
  ]
  it('owed counts only income after the last Hacienda payment', () => {
    expect(ivaOwed(txs)).toBe(264.60)
  })
  it('with no payment ever, everything counts', () => {
    expect(ivaOwed(txs.filter(t => !t.is_iva_payment))).toBe(1283.80)
  })
  it('recoverable sums flagged expense IVA', () => {
    expect(ivaRecoverable(txs)).toBe(13.00)
  })
})

describe('reserveVsActual', () => {
  const item = { estimated_cost: 3000, hours_interval: 300, last_complied_hours: 17400 }
  it('accrues since last compliance and compares', () => {
    expect(reserveVsActual({ item, currentHours: 17550, actualCost: 1200 }))
      .toEqual({ accrued: 1500, actual: 1200, delta: 300 })
  })
  it('null without a costed hours interval', () => {
    expect(reserveVsActual({ item: { estimated_cost: null }, currentHours: 1 })).toBe(null)
  })
})
