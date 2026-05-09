import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export const FLUID_TYPES = {
  engine_oil:        { label: 'Engine Oil',        short: 'Eng. Oil' },
  transmission_oil:  { label: 'Transmission Oil',  short: 'Trans. Oil' },
  hydraulic_fluid:   { label: 'Hydraulic Fluid',   short: 'Hydraulic' },
}

const GREASE_INTERVAL = 25   // hours
const GREASE_WARN_AT  = 23   // hours — start warning

function round2(n) { return Math.round(n * 100) / 100 }

export function useMaintenance(aircraftId, currentHobbs) {
  const [fluidLogs, setFluidLogs]   = useState({})   // keyed by fluid_type
  const [greaseLogs, setGreaseLogs] = useState([])
  const [loading, setLoading]       = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId || aircraftId === 'local-1') {
      setLoading(false)
      return
    }
    setLoading(true)

    // Fetch last 10 entries per fluid type in one query
    const { data: fluids } = await supabase
      .from('fluid_logs')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .order('hobbs_at_service', { ascending: false })
      .limit(60)

    // Group by fluid_type, keep max 10 each
    const grouped = {}
    for (const type of Object.keys(FLUID_TYPES)) grouped[type] = []
    for (const row of fluids ?? []) {
      if (grouped[row.fluid_type]?.length < 10) grouped[row.fluid_type].push(row)
    }
    setFluidLogs(grouped)

    // Grease — last 20 sessions
    const { data: grease } = await supabase
      .from('grease_logs')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .order('hobbs_at_service', { ascending: false })
      .limit(20)

    setGreaseLogs(grease ?? [])
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  // ── Fluid helpers ──────────────────────────────────────────────
  function getFluidStatus(type) {
    const history = fluidLogs[type] ?? []
    const last    = history[0] ?? null

    const hoursSince = last && currentHobbs != null
      ? Math.max(0, round2(currentHobbs - last.hobbs_at_service))
      : null

    // Trend: avg quarts per 10 hours flown (need ≥2 entries)
    let avgQtsPer10h = null
    if (history.length >= 2) {
      const oldest = history[history.length - 1]
      const hobbsSpan = last.hobbs_at_service - oldest.hobbs_at_service
      const totalQts  = history.slice(0, -1).reduce((s, e) => s + e.quantity_quarts, 0)
      if (hobbsSpan > 0) avgQtsPer10h = round2((totalQts / hobbsSpan) * 10)
    }

    // Direction of trend (last 2 vs previous 2)
    let trend = null
    if (history.length >= 4) {
      const recent = (history[0].quantity_quarts + history[1].quantity_quarts) / 2
      const older  = (history[2].quantity_quarts + history[3].quantity_quarts) / 2
      trend = recent > older ? 'up' : recent < older ? 'down' : 'flat'
    }

    return { last, history, hoursSince, avgQtsPer10h, trend }
  }

  // ── Grease timer ───────────────────────────────────────────────
  const lastGrease    = greaseLogs[0] ?? null
  const hoursSinceGrease = lastGrease && currentHobbs != null
    ? Math.max(0, round2(currentHobbs - lastGrease.hobbs_at_service))
    : null

  const greaseProgress     = hoursSinceGrease != null ? Math.min(hoursSinceGrease / GREASE_INTERVAL, 1) : 0
  const greaseWarning      = hoursSinceGrease != null && hoursSinceGrease >= GREASE_WARN_AT
  const greaseOverdue      = hoursSinceGrease != null && hoursSinceGrease >= GREASE_INTERVAL
  const greaseHoursLeft    = hoursSinceGrease != null ? Math.max(0, GREASE_INTERVAL - hoursSinceGrease) : null
  const greaseNextDueHobbs = lastGrease ? round2(lastGrease.hobbs_at_service + GREASE_INTERVAL) : null

  // ── Merged service history (all types + grease) ────────────────
  const allHistory = [
    ...(Object.values(fluidLogs).flat().map(e => ({ ...e, _kind: 'fluid' }))),
    ...(greaseLogs.map(e => ({ ...e, _kind: 'grease' }))),
  ].sort((a, b) => b.hobbs_at_service - a.hobbs_at_service)

  return {
    loading,
    refresh: load,
    fluidLogs,
    greaseLogs,
    allHistory,
    getFluidStatus,
    grease: {
      last: lastGrease,
      hoursSince: hoursSinceGrease,
      progress: greaseProgress,
      warning: greaseWarning,
      overdue: greaseOverdue,
      hoursLeft: greaseHoursLeft,
      nextDueHobbs: greaseNextDueHobbs,
      interval: GREASE_INTERVAL,
      warnAt: GREASE_WARN_AT,
    },
  }
}
