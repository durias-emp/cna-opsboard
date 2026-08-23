import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { round2 } from '../lib/utils'

export const TANK_MAX_GAL = 150
export const SUPPLIERS = {
  comalapa: 'Comalapa',
  ilopango: 'Ilopango',
}

export function useTank() {
  const [fillups,  setFillups]  = useState([])
  const [loading,  setLoading]  = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    // Full history: totals, averages and per-supplier stats are computed from
    // this list, so it must not be capped (it was limited to 50 rows before).
    const { data, error } = await supabase
      .from('tank_fillups')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) console.error('Tank load error:', error.message)
    setFillups(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // ── Derived values ─────────────────────────────────────────────
  const last           = fillups[0] ?? null           // most recent transaction (any type)
  const lastFillup     = fillups.find(f => f.type === 'fillup') ?? null  // most recent actual fill-up
  const currentLevel   = last ? round2(last.gallons_after) : null
  const fillPercent    = currentLevel != null ? Math.min(currentLevel / TANK_MAX_GAL, 1) : 0

  // Cost/volume stats — fillups only, never withdrawals
  const fillupOnly  = fillups.filter(f => f.type === 'fillup')
  const totalSpent  = round2(fillupOnly.reduce((s, f) => s + (f.total_cost    ?? 0), 0))
  const totalAdded  = round2(fillupOnly.reduce((s, f) => s + (f.gallons_added ?? 0), 0))

  // Average price per gallon (weighted by volume)
  const avgPricePerGal = totalAdded > 0
    ? round2(totalSpent / totalAdded)
    : null

  // Per-supplier breakdown — fillups only
  const bySupplier = Object.keys(SUPPLIERS).map(key => {
    const rows   = fillupOnly.filter(f => f.supplier === key)
    const spent  = round2(rows.reduce((s, f) => s + (f.total_cost    ?? 0), 0))
    const added  = round2(rows.reduce((s, f) => s + (f.gallons_added ?? 0), 0))
    return { key, label: SUPPLIERS[key], count: rows.length, spent, added }
  })

  // Monthly withdrawn (gallons pulled from tank this month)
  const monthStart       = new Date()
  monthStart.setDate(1)
  const _ms = monthStart
  const monthStartStr    = `${_ms.getFullYear()}-${String(_ms.getMonth() + 1).padStart(2, '0')}-01`
  const withdrawalsOnly  = fillups.filter(f => f.type === 'withdrawal')
  const monthWithdrawals = withdrawalsOnly.filter(f => f.date >= monthStartStr)
  const monthUsedGal     = round2(monthWithdrawals.reduce((s, f) => s + Math.abs(f.gallons_added ?? 0), 0))

  // Chart data — last 10 fill-ups (no withdrawals) oldest→newest
  const chartData = fillupOnly.slice(0, 10).reverse().map(f => ({
    date:            f.date,
    supplier:        f.supplier,
    gallonsAdded:    f.gallons_added,
    gallonsAfter:    f.gallons_after,
    pricePerGallon:  f.price_per_gallon,
    totalCost:       f.total_cost,
  }))

  return {
    fillups,
    fillupCount: fillupOnly.length,
    monthUsedGal,
    loading,
    refresh: load,
    last,
    lastFillup,
    currentLevel,
    fillPercent,
    totalSpent,
    totalAdded,
    avgPricePerGal,
    bySupplier,
    chartData,
  }
}
