// Pings Supabase daily (Vercel cron) so the free-tier project never pauses for inactivity.
// Calls the ping() function (the ONLY thing the anon key can execute after the
// 2026-08-22-auth-lockdown migration); falls back to a todos read pre-lockdown.
export default async function handler(req, res) {
  try {
    const headers = {
      apikey: process.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    }
    let resp = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/rpc/ping`, { method: 'POST', headers, body: '{}' })
    if (!resp.ok) {
      // ping() doesn't exist yet — legacy read keeps the project alive meanwhile
      resp = await fetch(`${process.env.VITE_SUPABASE_URL}/rest/v1/todos?select=id&limit=1`, { headers })
    }
    console.log(`[keep-alive] Supabase ${resp.ok ? 'OK' : 'FAILED'} — ${resp.status}`)
    return res.status(200).json({ ok: resp.ok, status: resp.status, ts: new Date().toISOString() })
  } catch (err) {
    console.error('[keep-alive] Error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
