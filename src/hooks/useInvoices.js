import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

function round2(n) { return Math.round(n * 100) / 100 }

export function useInvoices(aircraftId) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading]   = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId || aircraftId === 'local-1') {
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('invoices')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .order('invoice_number', { ascending: false })
    setInvoices(data ?? [])
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  const now        = new Date()
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

  const monthInvoices = invoices.filter(i => i.date >= monthStart)
  const totalBilled   = round2(invoices.reduce((s, i)      => s + (Number(i.amount_paid) || 0), 0))
  const monthBilled   = round2(monthInvoices.reduce((s, i) => s + (Number(i.amount_paid) || 0), 0))

  return {
    invoices,
    loading,
    refresh: load,
    stats: {
      total:       invoices.length,
      monthCount:  monthInvoices.length,
      totalBilled,
      monthBilled,
    },
  }
}
