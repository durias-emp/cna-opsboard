// Pings Supabase daily to prevent free-tier project pause
export default async function handler(req, res) {
  try {
    const resp = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/todos?select=id&limit=1`,
      {
        headers: {
          apikey: process.env.VITE_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
        },
      }
    )
    const ok = resp.ok
    console.log(`[keep-alive] Supabase ping ${ok ? 'OK' : 'FAILED'} — ${resp.status}`)
    return res.status(200).json({ ok, status: resp.status, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[keep-alive] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
