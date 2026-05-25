// ── CNA Monies — Create Transaction ───────────────────────────────────────────
// Called from FlightDrawer when pilot taps "Send to CNA Monies"
// Inserts a pending transaction into the CNA Monies Supabase project

const MONIES_URL     = process.env.MONIES_SUPABASE_URL
const MONIES_KEY     = process.env.MONIES_SUPABASE_ANON_KEY
const ACCOUNT_ID     = process.env.MONIES_ACCOUNT_ID  || 'acc-1'
const USER_ID        = process.env.MONIES_USER_ID      || null

// Map OpsBoard category labels → CNA Monies category values
const CATEGORY_MAP = {
  'Flight Hours':   'flight_hours',
  'Air Tours':      'air_tours',
  'Custom Flights': 'flight_hours',
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!MONIES_URL || !MONIES_KEY) {
    console.error('[monies] Missing env vars MONIES_SUPABASE_URL or MONIES_SUPABASE_ANON_KEY')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const { amount, party, notes, date, flight_time, rate_per_hr, pilot, category } = req.body ?? {}

  if (!amount || !date) {
    return res.status(400).json({ error: 'Missing required fields: amount, date' })
  }

  const mappedCategory = CATEGORY_MAP[category] ?? 'flight_hours'

  // Build description string
  const parts = []
  if (flight_time) parts.push(`${flight_time} flight time`)
  if (rate_per_hr)  parts.push(`at $${rate_per_hr}/hr`)
  if (pilot)        parts.push(`· ${pilot}`)
  if (notes)        parts.push(`· ${notes}`)
  const description = parts.join(' ')

  const payload = {
    account_id:  ACCOUNT_ID,
    user_id:     USER_ID,
    date,
    party:       party || pilot || 'CNA Flight',   // party is NOT NULL in schema
    amount,                                         // positive = income
    category:    mappedCategory,
    description: description || null,
    status:      'pending',
  }

  try {
    const resp = await fetch(`${MONIES_URL}/rest/v1/transactions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':         MONIES_KEY,
        'Authorization': `Bearer ${MONIES_KEY}`,
        'Prefer':         'return=minimal',
      },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error('[monies] Supabase error:', text)
      return res.status(500).json({ error: text })
    }

    console.log(`[monies] Transaction created — $${amount} · ${mappedCategory} · ${date}`)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[monies] Fetch error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
