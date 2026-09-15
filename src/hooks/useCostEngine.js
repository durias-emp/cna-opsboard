import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useCostRates } from './useCostRates'
import { useQuoteProfile } from './useQuoteProfile'
import {
  splitEntry, fuelRatePerHour, pilotRatePerHour, reservePerHour,
  variablePerHour, trailingAnnualHours, fixedPerHour, fullyLoadedPerHour,
  breakevenHoursMonth,
} from '../lib/financeCalc'

// Feeds the pure calc engine with live data and returns every derived rate.
// One fetch per mount; the same numbers drive the Costs tab and the flight
// cost stamp so they can never disagree.
export function useCostEngine(aircraftId) {
  const { rates, missing, loading: ratesLoading, save } = useCostRates(aircraftId)
  const profile = useQuoteProfile(aircraftId)
  const [raw, setRaw] = useState({ purchases: [], burnRows: [], monthsHours: [], reserveItems: [] })
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId) { setLoading(false); return }
    const [fillups, flights, items] = await Promise.all([
      supabase.from('tank_fillups')
        .select('date, gallons_added, total_cost, includes_iva')
        .gt('total_cost', 0).gt('gallons_added', 0).limit(300),
      supabase.from('flights')
        .select('date, total_minutes, fuel_consumed_gal')
        .eq('aircraft_id', aircraftId).limit(600),
      supabase.from('maintenance_items')
        .select('id, description, estimated_cost, hours_interval, calendar_interval_months, last_complied_hours')
        .eq('aircraft_id', aircraftId).eq('is_active', true),
    ])
    const purchases = (fillups.data ?? []).map(f => ({
      gallons: Number(f.gallons_added),
      costNet: splitEntry(Number(f.total_cost), f.includes_iva !== false).amount_net,
    }))
    const burnRows = (flights.data ?? []).map(f => ({
      airHours: (f.total_minutes ?? 0) / 60,
      fuelGal: Number(f.fuel_consumed_gal ?? 0),
    }))
    // Full months only: the running month would drag utilization down
    const byMonth = {}
    for (const f of flights.data ?? []) {
      const m = (f.date ?? '').slice(0, 7)
      if (m) byMonth[m] = (byMonth[m] ?? 0) + (f.total_minutes ?? 0) / 60
    }
    const thisMonth = new Date().toISOString().slice(0, 7)
    const monthsHours = Object.entries(byMonth)
      .filter(([m]) => m < thisMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, hours]) => ({ month, hours }))
    setRaw({ purchases, burnRows, monthsHours, reserveItems: items.data ?? [] })
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  const derived = useMemo(() => {
    const trailing = trailingAnnualHours(raw.monthsHours)
    const monthlyUtil = trailing.hours != null ? trailing.hours / 12 : null
    const fuelRate = fuelRatePerHour({
      purchases: raw.purchases,
      flights: raw.burnRows,
      fallbackPriceGal: rates?.fuel_price_gal != null ? Number(rates.fuel_price_gal) : null,
      profileBurnGph: profile?.burn_gph != null ? Number(profile.burn_gph) : 27,
    })
    const pilotRate = pilotRatePerHour({
      rate_hr: rates?.pilot_rate_hr != null ? Number(rates.pilot_rate_hr) : null,
      monthly: rates?.pilot_monthly != null ? Number(rates.pilot_monthly) : null,
      monthlyHours: monthlyUtil,
    })
    const reserveRate = reservePerHour(raw.reserveItems.map(i => ({
      estimated_cost: i.estimated_cost != null ? Number(i.estimated_cost) : null,
      hours_interval: i.hours_interval,
      calendar_interval_months: i.calendar_interval_months,
    })), { monthlyUtilizationHours: monthlyUtil })
    const variableRate = variablePerHour({ fuelRate, pilotRate, reserveRate })
    const annualFixed = ['insurance_year', 'hangar_year', 'other_fixed_year']
      .reduce((s, k) => s + (rates?.[k] != null ? Number(rates[k]) : 0), 0)
    const fixedRate = fixedPerHour({ annualFixed, trailingHours: trailing.hours })
    const fullyLoaded = fullyLoadedPerHour({ variableRate, fixedRate })
    // Target rate: the override, else the quote profile netted of tax
    const profileNet = profile?.rate_hr != null
      ? splitEntry(Number(profile.rate_hr), profile.tax_included === true).amount_net
      : null
    const targetRateNet = rates?.target_rate_hr != null ? Number(rates.target_rate_hr) : profileNet
    const breakeven = breakevenHoursMonth({
      fixedMonthly: annualFixed / 12, targetRateNet, variableRate,
    })
    return {
      trailing, monthlyUtil, fuelRate, pilotRate, reserveRate, variableRate,
      annualFixed, fixedRate, fullyLoaded, targetRateNet, breakeven,
    }
  }, [raw, rates, profile])

  return {
    rates, ratesMissing: missing, saveRates: save,
    loading: loading || ratesLoading,
    reserveItems: raw.reserveItems,
    ...derived,
    refresh: load,
  }
}
