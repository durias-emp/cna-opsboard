// Smoke tests for the arithmetic that has real-world consequences:
// hobbs conversion, Weight & Balance, and maintenance status thresholds.
import { describe, it, expect } from 'vitest'
import { toHobbs } from '../src/lib/utils'
import { calculate, invalidFields } from '../src/components/WeightBalanceCalculator'
import { enrichItem, STATUS } from '../src/hooks/useMaintenanceItems'

describe('toHobbs (minutes → decimal hours, 0.1 resolution)', () => {
  it('converts exact tenths', () => {
    expect(toHobbs(6)).toBe(0.1)
    expect(toHobbs(60)).toBe(1.0)
    expect(toHobbs(90)).toBe(1.5)
  })
  it('rounds to the nearest tenth', () => {
    expect(toHobbs(61)).toBe(1.0)   // 10.17 tenths → 10
    expect(toHobbs(63)).toBe(1.1)   // 10.5 tenths → 11
  })
  it('handles zero', () => { expect(toHobbs(0)).toBe(0) })
})

const NO_WEIGHTS = { pilot:'', pax1:'', pax2:'', pax3:'', pax4:'', baggage:'', extender:'', fuel:'' }
const ALL_DOORS_ON = { frontLeft:true, frontRight:true, rearLeft:true, rearRight:true }

describe('Weight & Balance (Bell 206B3, BEW 1976.0 lb @ 115.96 in)', () => {
  it('matches a hand-computed case: 200 lb pilot + 50 USG fuel', () => {
    const r = calculate({ ...NO_WEIGHTS, pilot:'200', fuel:'50' }, ALL_DOORS_ON)
    // Zero fuel: (1976·115.96 + 200·65) / 2176 = 111.276…
    expect(r.zeroFuel.weight).toBeCloseTo(2176, 5)
    expect(r.zeroFuel.longCG).toBeCloseTo(111.2762, 3)
    expect(r.zeroFuel.latCG).toBeCloseTo(1.4139, 3)
    // All up: + 335 lb fuel @ 110.60
    expect(r.allUp.weight).toBeCloseTo(2511, 5)
    expect(r.allUp.longCG).toBeCloseTo(111.1859, 3)
    expect(r.status.overweight).toBe(false)
    expect(r.status.zfLongOK && r.status.zfLatOK && r.status.auLongOK && r.status.auLatOK).toBe(true)
  })
  it('flags overweight past 3200 lb MTOW', () => {
    const r = calculate({ ...NO_WEIGHTS, pilot:'200', pax1:'200', pax2:'200', pax3:'200', pax4:'200', baggage:'250', fuel:'70' }, ALL_DOORS_ON)
    expect(r.allUp.weight).toBeGreaterThan(3200)
    expect(r.status.overweight).toBe(true)
  })
  it('removing a front door widens the forward limit to 111.6', () => {
    const r = calculate({ ...NO_WEIGHTS, pilot:'200' }, { ...ALL_DOORS_ON, frontLeft:false })
    expect(r.limits.fwdLim).toBe(111.6)
  })
  it('rejects invalid weights instead of treating them as zero', () => {
    expect(invalidFields({ ...NO_WEIGHTS, pilot:'-20' })).toEqual(['pilot'])
    expect(invalidFields({ ...NO_WEIGHTS, pax1:'abc' })).toEqual(['pax1'])
    expect(invalidFields(NO_WEIGHTS)).toEqual([])
    const r = calculate({ ...NO_WEIGHTS, pilot:'-20' }, ALL_DOORS_ON)
    expect(r.status.hasInvalid).toBe(true)
  })
})

describe('Maintenance status thresholds', () => {
  const base = { limit_type: null, notes: null }
  it('overdue when hours run out', () => {
    expect(enrichItem({ ...base, due_at_hours: 100 }, 100, 0).status).toBe(STATUS.OVERDUE)
    expect(enrichItem({ ...base, due_at_hours: 100 }, 100.1, 0).status).toBe(STATUS.OVERDUE)
  })
  it('due soon inside 10h for standard items, 50h for heavy (>=1500h interval) items', () => {
    expect(enrichItem({ ...base, due_at_hours: 110, hours_interval: 100 },  100, 0).status).toBe(STATUS.DUE_SOON)
    expect(enrichItem({ ...base, due_at_hours: 111, hours_interval: 100 },  100, 0).status).toBe(STATUS.OK)
    expect(enrichItem({ ...base, due_at_hours: 149, hours_interval: 1500 }, 100, 0).status).toBe(STATUS.DUE_SOON)
    expect(enrichItem({ ...base, due_at_hours: 151, hours_interval: 1500 }, 100, 0).status).toBe(STATUS.OK)
  })
  it('overdue on a past calendar date', () => {
    expect(enrichItem({ ...base, due_date: '2020-01-01' }, 0, 0).status).toBe(STATUS.OVERDUE)
  })
  it('cycles: overdue at zero remaining, due soon inside 100', () => {
    expect(enrichItem({ ...base, due_at_cycles: 500 }, 0, 500).status).toBe(STATUS.OVERDUE)
    expect(enrichItem({ ...base, due_at_cycles: 500 }, 0, 401).status).toBe(STATUS.DUE_SOON)
  })
  it('legacy N/A note hides an item only until the explicit column exists', () => {
    expect(enrichItem({ ...base, notes: 'N/A by Serial' }, 0, 0).status).toBe(STATUS.NOT_APPLICABLE)
    // column present and false → the note text no longer controls status
    expect(enrichItem({ ...base, notes: 'N/A by Serial', is_not_applicable: false, due_at_hours: 1 }, 100, 0).status).toBe(STATUS.OVERDUE)
    expect(enrichItem({ ...base, notes: null, is_not_applicable: true }, 100, 0).status).toBe(STATUS.NOT_APPLICABLE)
  })
  it('TRACK running totals from columns or legacy notes', () => {
    const legacy = enrichItem({ ...base, limit_type:'ON_CONDITION', notes:'TRACK:1000:500', last_complied_hours: 90 }, 100, 0)
    expect(legacy.trackAcHours).toBeCloseTo(1010, 5)
    expect(legacy.trackOhHours).toBeCloseTo(510, 5)
    const cols = enrichItem({ ...base, limit_type:'ON_CONDITION', track_ac_ref: 2000, track_oh_ref: 700, last_complied_hours: 90, notes: null }, 100, 0)
    expect(cols.trackAcHours).toBeCloseTo(2010, 5)
  })
})
