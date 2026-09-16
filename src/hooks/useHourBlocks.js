import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { blockBalance } from '../lib/financeCalc'

// Block hour accounts: one per client, recharged like a card. Flights draw
// FLIGHT time against a block. Degrades to an empty list until the migration
// 2026-09-16-finance-hour-blocks.sql has run.
export function useHourBlocks(aircraftId) {
  const [blocks, setBlocks] = useState([])
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId) { setBlocks([]); setLoading(false); return }
    const b = await supabase.from('hour_blocks')
      .select('*').eq('aircraft_id', aircraftId).eq('is_active', true).order('client')
    if (b.error) { setMissing(true); setBlocks([]); setLoading(false); return }
    setMissing(false)

    const ids = (b.data ?? []).map(x => x.id)
    const [rech, fl] = await Promise.all([
      ids.length
        ? supabase.from('block_recharges').select('*').in('block_id', ids).order('date')
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase.from('flights')
            .select('id, date, block_id, billed_hours, flight_time_minutes, pilot')
            .in('block_id', ids).order('date', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    setBlocks((b.data ?? []).map(block => {
      const recharges = (rech.data ?? []).filter(r => r.block_id === block.id)
        .map(r => ({ ...r, hours: Number(r.hours), rate_hr: Number(r.rate_hr) }))
      const flights = (fl.data ?? []).filter(f => f.block_id === block.id)
        .map(f => ({
          ...f,
          // billed_hours is the authority; fall back to logged flight time
          hours: Number(f.billed_hours ?? (f.flight_time_minutes ?? 0) / 60),
        }))
      return {
        ...block,
        recharges,
        flights,
        ...blockBalance({
          recharges,
          draws: flights,
          openingHoursUsed: Number(block.opening_hours_used ?? 0),
        }),
        // the rate a new flight would bill at: the latest recharge's rate
        currentRate: recharges.length ? recharges[recharges.length - 1].rate_hr : null,
      }
    }))
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  const createBlock = useCallback(async (client, notes = null) => {
    const { error } = await supabase.from('hour_blocks')
      .insert({ aircraft_id: aircraftId, client: client.trim(), notes })
    if (error) return error.message
    await load()
    return null
  }, [aircraftId, load])

  // Recharge: hours bought at a net rate. Optionally records the payment in
  // the ledger so the money and the hours point at each other.
  const recharge = useCallback(async ({ blockId, date, hours, rateHr, ivaAmount = 0, notes = null, recordPayment = true, client }) => {
    const amountNet = Math.round(hours * rateHr * 100) / 100
    let transactionId = null
    if (recordPayment) {
      const acc = await supabase.from('finance_accounts')
        .select('id').eq('aircraft_id', aircraftId).eq('type', 'bank').limit(1).maybeSingle()
      if (acc.data?.id) {
        const tx = await supabase.from('finance_transactions').insert({
          aircraft_id: aircraftId, account_id: acc.data.id, date,
          party: client, amount_net: amountNet, iva_amount: ivaAmount,
          category: 'flight_revenue', includes_iva: ivaAmount > 0, iva_recoverable: false,
          description: `${hours} block hours at ${rateHr} net`,
        }).select('id').maybeSingle()
        transactionId = tx.data?.id ?? null
      }
    }
    const { error } = await supabase.from('block_recharges').insert({
      block_id: blockId, date, hours, rate_hr: rateHr,
      amount_net: amountNet, iva_amount: ivaAmount,
      transaction_id: transactionId, notes,
    })
    if (error) return error.message
    await load()
    return null
  }, [aircraftId, load])

  return { blocks, missing, loading, refresh: load, createBlock, recharge }
}
