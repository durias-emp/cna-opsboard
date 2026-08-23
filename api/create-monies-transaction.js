// ── CNA Monies — Create Transaction ───────────────────────────────────────────
// Called from FlightDrawer when a pilot taps "Send to CNA Monies".
// Inserts a pending income transaction into the separate CNA Monies Supabase project.
//
// Hardened 2026-08-22:
//  - When login is enabled (VITE_AUTH_ENABLED=true) the caller must send a valid
//    Supabase user access token — anonymous internet calls get 401.
//  - Idempotency: each attempt carries a key; a repeat of the same key returns 409
//    instead of double-posting revenue (ledger table: monies_submissions).

const MONIES_URL   = process.env.MONIES_SUPABASE_URL
const MONIES_KEY   = process.env.MONIES_SUPABASE_ANON_KEY
const ACCOUNT_ID   = process.env.MONIES_ACCOUNT_ID || 'acc-1'
const USER_ID      = process.env.MONIES_USER_ID || null
const OPS_URL      = process.env.VITE_SUPABASE_URL
const OPS_ANON     = process.env.VITE_SUPABASE_ANON_KEY
const AUTH_ENABLED = process.env.VITE_AUTH_ENABLED === 'true'

const CATEGORY_MAP = {
  'Flight Hours':   'flight_hours',
  'Air Tours':      'air_tours',
  'Custom Flights': 'flight_hours',
}

async function verifyUser(token) {
  if (!token) return null
  const resp = await fetch(`${OPS_URL}/auth/v1/user`, {
    headers: { apikey: OPS_ANON, Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) return null
  return resp.json()   // the logged-in user
}

// Insert the idempotency key; false = this key was already used (duplicate attempt).
async function claimKey(key, token) {
  const resp = await fetch(`${OPS_URL}/rest/v1/monies_submissions`, {
    method: 'POST',
    headers: {
      apikey: OPS_ANON,
      Authorization: `Bearer ${token ?? OPS_ANON}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ idempotency_key: key }),
  })
  if (resp.status === 409) return false            // duplicate
  if (!resp.ok) {
    // Table missing pre-migration (404/42P01) — no dedupe available yet, allow through
    console.warn('[monies] idempotency ledger unavailable:', resp.status)
  }
  return true
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!MONIES_URL || !MONIES_KEY) {
    console.error('[monies] Missing env vars MONIES_SUPABASE_URL or MONIES_SUPABASE_ANON_KEY')
    return res.status(500).json({ error: 'Server misconfiguration' })
  }

  const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || null
  let user = null
  if (AUTH_ENABLED) {
    user = await verifyUser(token)
    if (!user) return res.status(401).json({ error: 'Sign in required' })
  }

  const { amount, party, notes, date, flight_time, rate_per_hr, pilot, category, idempotency_key } = req.body ?? {}

  const amountNum = typeof amount === 'number' ? amount : parseFloat(amount)
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return res.status(400).json({ error: 'amount must be a positive number' })
  }
  if (!date) return res.status(400).json({ error: 'Missing required field: date' })

  if (idempotency_key) {
    const fresh = await claimKey(String(idempotency_key).slice(0, 128), token)
    if (!fresh) return res.status(409).json({ error: 'This flight was already sent to Monies' })
  }

  const mappedCategory = CATEGORY_MAP[category] ?? 'flight_hours'

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
    amount:      amountNum,                         // positive = income
    category:    mappedCategory,
    description: description || null,
    status:      'pending',
  }

  try {
    const resp = await fetch(`${MONIES_URL}/rest/v1/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: MONIES_KEY,
        Authorization: `Bearer ${MONIES_KEY}`,
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(payload),
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error('[monies] Supabase error:', text)
      return res.status(500).json({ error: text })
    }

    console.log(`[monies] Transaction created — $${amountNum} · ${mappedCategory} · ${date} · by ${user?.email ?? 'legacy'}`)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[monies] Fetch error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
