// Finance calculation engine. Pure functions only: plain data in, numbers out.
// No Supabase, no React, no Date.now() (period boundaries are passed in).
// Money is NET USD throughout; IVA splits happen once, at entry, and are
// never recomputed from net (docs/finance-plan.md decision 1).

export const IVA_RATE = 13 / 113

const r2 = n => Math.round(n * 100) / 100

// AT ENTRY only: split a figure into { amount_net, iva_amount }.
// includesIva true means the figure is gross; false means it is already net.
export function splitEntry(amount, includesIva) {
  if (!Number.isFinite(amount)) return { amount_net: 0, iva_amount: 0 }
  if (!includesIva) return { amount_net: r2(amount), iva_amount: 0 }
  const iva = r2(amount * IVA_RATE)
  return { amount_net: r2(amount - iva), iva_amount: iva }
}

// Weighted average fuel price per gallon (net) from purchases, times the
// fleet burn in gal/hr. Burn comes from logged consumption when there is
// enough of it, else the profile burn (quote profile, owner-provided).
// purchases: [{ gallons, costNet }]  flights: [{ airHours, fuelGal }]
export function fuelRatePerHour({ purchases = [], flights = [], fallbackPriceGal = null, profileBurnGph = null }) {
  const gal  = purchases.reduce((s, p) => s + (p.gallons ?? 0), 0)
  const cost = purchases.reduce((s, p) => s + (p.costNet ?? 0), 0)
  const priceGal = gal > 0 ? cost / gal : fallbackPriceGal
  const burnHours = flights.reduce((s, f) => s + ((f.fuelGal ?? 0) > 0 ? (f.airHours ?? 0) : 0), 0)
  const burnGal   = flights.reduce((s, f) => s + (f.fuelGal ?? 0), 0)
  const burnGph = burnHours >= 5 && burnGal > 0 ? burnGal / burnHours : profileBurnGph
  if (priceGal == null || burnGph == null) return null
  return r2(priceGal * burnGph)
}

// Pilot cost per flight hour. Hourly only for CNA (100.00 net); the monthly
// path exists for other tenants and needs the month's hours to allocate.
export function pilotRatePerHour({ rate_hr = null, monthly = null, monthlyHours = null }) {
  if (rate_hr != null) return r2(rate_hr)
  if (monthly != null && monthlyHours > 0) return r2(monthly / monthlyHours)
  return null
}

// Reserve per hour across the program. Hours items: cost / hours_interval.
// Calendar items: cost / expected hours inside the interval, where expected
// hours = interval months * monthly utilization. Items without a cost (null)
// contribute nothing; zero is a valid, deliberate value.
// items: [{ estimated_cost, hours_interval, calendar_interval_months }]
export function reservePerHour(items = [], { monthlyUtilizationHours = null } = {}) {
  let total = 0
  for (const i of items) {
    const cost = i.estimated_cost
    if (cost == null) continue
    if (i.hours_interval > 0) {
      total += cost / i.hours_interval
    } else if (i.calendar_interval_months > 0 && monthlyUtilizationHours > 0) {
      total += cost / (i.calendar_interval_months * monthlyUtilizationHours)
    }
  }
  return r2(total)
}

export function variablePerHour({ fuelRate = 0, pilotRate = 0, reserveRate = 0 }) {
  return r2((fuelRate ?? 0) + (pilotRate ?? 0) + (reserveRate ?? 0))
}

// Trailing utilization for fixed-cost allocation. With 12+ full months of
// history the trailing 12-month hours are used as-is; with less, the
// available full months are annualized (minimum 3) and flagged.
// monthsHours: [{ month: 'YYYY-MM', hours }] for FULL months only.
export function trailingAnnualHours(monthsHours = []) {
  const n = monthsHours.length
  if (n === 0) return { hours: null, annualized: false, months: 0 }
  const sum = monthsHours.reduce((s, m) => s + (m.hours ?? 0), 0)
  if (n >= 12) {
    const last12 = monthsHours.slice(-12).reduce((s, m) => s + (m.hours ?? 0), 0)
    return { hours: r2(last12), annualized: false, months: 12 }
  }
  if (n < 3) return { hours: null, annualized: true, months: n }
  return { hours: r2((sum / n) * 12), annualized: true, months: n }
}

export function fixedPerHour({ annualFixed = 0, trailingHours = null }) {
  if (!trailingHours || trailingHours <= 0) return null
  return r2(annualFixed / trailingHours)
}

export function fullyLoadedPerHour({ variableRate = null, fixedRate = null }) {
  if (variableRate == null && fixedRate == null) return null
  return r2((variableRate ?? 0) + (fixedRate ?? 0))
}

export function costOfFlight({ airTimeHours = 0, variableRate = 0, fixedRate = 0 }) {
  return r2(airTimeHours * ((variableRate ?? 0) + (fixedRate ?? 0)))
}

// Commercial only. priceNet null means "no price recorded", not zero.
export function marginOfFlight({ priceNet = null, cost = null }) {
  if (priceNet == null || cost == null) return null
  return r2(priceNet - cost)
}

export function breakevenHoursMonth({ fixedMonthly = 0, targetRateNet = null, variableRate = null }) {
  if (targetRateNet == null || variableRate == null) return null
  const contribution = targetRateNet - variableRate
  if (contribution <= 0) return Infinity
  return r2(fixedMonthly / contribution)
}

// IVA owed: iva_amount summed over income transactions dated after the last
// IVA payment to Hacienda. Never recomputed from net.
// txs: [{ date, amount_net, iva_amount, is_iva_payment }]
export function ivaOwed(txs = []) {
  const lastPaid = txs.filter(t => t.is_iva_payment).map(t => t.date).sort().pop() ?? ''
  return r2(txs
    .filter(t => !t.is_iva_payment && t.amount_net > 0 && t.date > lastPaid)
    .reduce((s, t) => s + (t.iva_amount ?? 0), 0))
}

// IVA recoverable: iva_amount summed over expenses flagged recoverable.
export function ivaRecoverable(txs = []) {
  return r2(txs
    .filter(t => t.amount_net < 0 && t.iva_recoverable)
    .reduce((s, t) => s + (t.iva_amount ?? 0), 0))
}

// Reserve accrued since last compliance vs the actual cost recorded there.
// item: { estimated_cost, hours_interval, last_complied_hours }
export function reserveVsActual({ item, currentHours = null, actualCost = null }) {
  if (item?.estimated_cost == null || !(item.hours_interval > 0)) return null
  const since = currentHours != null && item.last_complied_hours != null
    ? Math.max(0, currentHours - item.last_complied_hours) : null
  const accrued = since != null ? r2((item.estimated_cost / item.hours_interval) * since) : null
  return {
    accrued,
    actual: actualCost != null ? r2(actualCost) : null,
    delta: accrued != null && actualCost != null ? r2(accrued - actualCost) : null,
  }
}

// ── Block hour accounts ────────────────────────────────────────────────────
// A client's block is recharged like a card; each recharge carries its own
// net rate. Hours are drawn FIFO, so a flight is valued at the rate actually
// paid for the hours it consumes, and a flight that straddles two recharges
// is valued pro rata.
// recharges: [{ date, hours, rate_hr }]  (any order; sorted here)
// draws:     [{ date, hours }]           (flight time deducted)

export function blockBalance({ recharges = [], draws = [], openingHoursUsed = 0 }) {
  const bought = recharges.reduce((s, r) => s + Number(r.hours ?? 0), 0)
  const flown  = draws.reduce((s, d) => s + Number(d.hours ?? 0), 0) + Number(openingHoursUsed ?? 0)
  const remaining = Math.round((bought - flown) * 100) / 100
  const value = recharges.reduce((s, r) => s + Number(r.hours ?? 0) * Number(r.rate_hr ?? 0), 0)
  // What the remaining hours are worth: the rate of the hours still unused (FIFO)
  const order = [...recharges].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let used = flown, owedValue = 0
  for (const r of order) {
    const h = Number(r.hours ?? 0)
    const consumed = Math.min(used, h)
    used -= consumed
    const left = h - consumed
    if (left > 0) owedValue += left * Number(r.rate_hr ?? 0)
  }
  return {
    boughtHours: Math.round(bought * 100) / 100,
    flownHours:  Math.round(flown * 100) / 100,
    remainingHours: remaining,
    purchasedValue: Math.round(value * 100) / 100,
    // Unflown hours are a liability: money taken for work not yet done
    owedValue: Math.round(Math.max(owedValue, 0) * 100) / 100,
    overdrawn: remaining < 0,
  }
}

// Net revenue recognised for one draw, at the FIFO rate of the hours it eats.
// hoursBefore = hours already drawn from the block before this flight.
export function blockDrawValue({ recharges = [], hoursBefore = 0, hours = 0 }) {
  const order = [...recharges].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  let skip = Number(hoursBefore ?? 0), need = Number(hours ?? 0), value = 0, lastRate = null
  for (const r of order) {
    let avail = Number(r.hours ?? 0)
    lastRate = Number(r.rate_hr ?? 0)
    if (skip >= avail) { skip -= avail; continue }
    avail -= skip; skip = 0
    const take = Math.min(avail, need)
    value += take * Number(r.rate_hr ?? 0)
    need -= take
    if (need <= 0.0001) break
  }
  // Overdrawn hours keep billing at the most recent rate
  if (need > 0.0001 && lastRate != null) value += need * lastRate
  return Math.round(value * 100) / 100
}
