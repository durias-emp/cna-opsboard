import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Finance summary derived ENTIRELY from what the app already captures:
// flight prices (income), fuel purchases, maintenance actuals (scheduled via
// the compliance log, unscheduled via snags). No finance tables yet; this is
// the read-only ledger the Phase 4 transactions table will supersede.
// All totals are NET: gross figures (includes_iva) are converted at 13/113.

const IVA = 13 / 113
export const toNet = (amount, includesIva) =>
  includesIva === false ? amount : Math.round(amount * (1 - IVA) * 100) / 100

function monthKey(dateStr) { return (dateStr ?? '').slice(0, 7) }

export function useFinanceSummary(aircraftId) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId) { setEntries([]); setLoading(false); return }
    setLoading(true)

    // Real ledger rows (phase 4a tables). Absent until the migration runs;
    // the select degrades to an empty list without complaining.
    let txs = await supabase.from('finance_transactions')
      .select('id, date, party, amount_net, iva_amount, category, description, is_pending, deleted_at')
      .eq('aircraft_id', aircraftId).is('deleted_at', null)
      .order('date', { ascending: false }).limit(500)
    if (txs.error) txs = { data: [] }

    // flights.deleted_at arrives with migration phase 1b; select degrades
    // gracefully until it has run
    let flights = await supabase.from('flights')
      .select('id, date, pilot, price, total_minutes, deleted_at')
      .eq('aircraft_id', aircraftId).order('date', { ascending: false }).limit(400)
    if (flights.error) {
      flights = await supabase.from('flights')
        .select('id, date, pilot, price, total_minutes')
        .eq('aircraft_id', aircraftId).order('date', { ascending: false }).limit(400)
    }

    const [fuel, snags, compliance] = await Promise.all([
      supabase.from('tank_fillups')
        .select('id, date, supplier, total_cost, gallons_added, includes_iva')
        .gt('total_cost', 0).order('date', { ascending: false }).limit(200),
      supabase.from('snags')
        .select('id, resolved_date, description, actual_cost, includes_iva, invoice_ref')
        .eq('aircraft_id', aircraftId).not('actual_cost', 'is', null).limit(200),
      supabase.from('maintenance_compliance_log')
        .select('id, complied_date, work_order_number, actual_cost, includes_iva, invoice_ref')
        .eq('aircraft_id', aircraftId).not('actual_cost', 'is', null).limit(200),
    ])

    const out = []
    const INCOME_CATS = new Set(['flight_revenue', 'other_income'])
    // A transaction is the authority: a derived fuel entry on a date that
    // already has a fuel transaction would double-count and is skipped.
    const txFuelDates = new Set()
    for (const x of txs.data ?? []) {
      if (x.category === 'fuel') txFuelDates.add(x.date)
      const net = Number(x.amount_net), iva = Number(x.iva_amount)
      out.push({
        kind: INCOME_CATS.has(x.category) ? 'income' : x.category,
        id: `x-${x.id}`, date: x.date,
        label: x.party,
        detail: x.description ?? null,
        chip: INCOME_CATS.has(x.category) ? 'Income' : x.category.replace(/_/g, ' '),
        net, iva,
        // cash: what actually moved through the account (gross), the Monies view
        cash: net >= 0 ? net + iva : net - iva,
        pending: x.is_pending,
      })
    }
    for (const f of flights.data ?? []) {
      if (f.deleted_at) continue
      out.push({
        kind: 'flight', id: `f-${f.id}`, date: f.date,
        label: `Flight · ${f.pilot ?? ''}`.trim(),
        detail: `${((f.total_minutes ?? 0) / 60).toFixed(1)} h air time`,
        hours: (f.total_minutes ?? 0) / 60,
        net: f.price != null ? Number(f.price) : null,   // prices are entered net
      })
    }
    for (const t of fuel.data ?? []) {
      if (txFuelDates.has(t.date)) continue
      out.push({
        kind: 'fuel', id: `t-${t.id}`, date: t.date,
        label: `Fuel · ${t.supplier ?? ''}`.trim(),
        detail: `${Number(t.gallons_added ?? 0).toFixed(1)} gal`,
        net: -toNet(Number(t.total_cost), t.includes_iva),
        cash: -Number(t.total_cost),   // what left the account, gross
      })
    }
    for (const s of snags.data ?? []) {
      out.push({
        kind: 'maintenance', id: `s-${s.id}`, date: s.resolved_date,
        label: 'Snag fix', detail: (s.description ?? '').slice(0, 60),
        invoice: s.invoice_ref,
        net: -toNet(Number(s.actual_cost), s.includes_iva),
      })
    }
    for (const w of compliance.data ?? []) {
      out.push({
        kind: 'maintenance', id: `w-${w.id}`, date: w.complied_date,
        label: `Work order ${w.work_order_number ?? ''}`.trim(),
        detail: 'Scheduled maintenance', invoice: w.invoice_ref,
        net: -toNet(Number(w.actual_cost), w.includes_iva),
      })
    }
    out.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
    setEntries(out)
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  const nowMonth = monthKey(new Date().toISOString())
  const inMonth  = entries.filter(e => monthKey(e.date) === nowMonth)
  const sum = (list, f) => Math.round(list.reduce((s, e) => s + (f(e) ?? 0), 0) * 100) / 100

  // Spend breakdown by source, biggest first (the dashboard donut)
  const spendKinds = {}
  for (const e of inMonth) {
    if ((e.net ?? 0) >= 0) continue
    spendKinds[e.kind] = (spendKinds[e.kind] ?? 0) + Math.abs(e.net)
  }
  const spendByKind = Object.entries(spendKinds)
    .map(([kind, net]) => ({ kind, net: Math.round(net * 100) / 100 }))
    .sort((a, b) => b.net - a.net)

  // The Monies view: total liquid position, cash in and out, gross (what
  // moved through the accounts). Entries without a cash figure fall back to
  // net (flight prices, maintenance actuals).
  const cashOf = e => e.cash ?? e.net ?? 0
  const allTime = {
    incomeCash:  Math.round(entries.reduce((s, e) => s + (cashOf(e) > 0 ? cashOf(e) : 0), 0) * 100) / 100,
    expenseCash: Math.abs(Math.round(entries.reduce((s, e) => s + (cashOf(e) < 0 ? cashOf(e) : 0), 0) * 100) / 100),
  }
  allTime.position = Math.round((allTime.incomeCash - allTime.expenseCash) * 100) / 100

  return {
    entries, loading, refresh: load, allTime,
    month: {
      revenueNet: sum(inMonth, e => (e.net ?? 0) > 0 ? e.net : 0),
      spendNet:   Math.abs(sum(inMonth, e => (e.net ?? 0) < 0 ? e.net : 0)),
      netTotal:   sum(inMonth, e => e.net),
      hours:      Math.round(sum(inMonth, e => e.hours) * 10) / 10,
      spendByKind,
    },
  }
}
