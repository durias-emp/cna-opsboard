const RECIPIENTS_FLIGHT_LOG  = ['info@cielonorteaviacion.com', 'james@cielonorteaviacion.com']
const RECIPIENTS_ITINERARY   = ['info@cielonorteaviacion.com', 'james@cielonorteaviacion.com', 'helicorp@truenorthairways.ca', 'javier@cielonorteaviacion.com', 'alonia@cielonorteaviacion.com']
const FROM = 'CNA OpsBoard <ops@cielonorteaviacion.com>'

// ── Helpers ────────────────────────────────────────────────────────────────────

// HTML-escape one string. Everything user-entered is interpolated into the email
// body, so every string in the record is escaped ONCE, up front, by deepEscape().
function esc(v) {
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// Recursively escape every string value in an object/array (numbers, booleans, null untouched).
function deepEscape(v) {
  if (typeof v === 'string') return esc(v)
  if (Array.isArray(v))      return v.map(deepEscape)
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, val] of Object.entries(v)) out[k] = deepEscape(val)
    return out
  }
  return v
}

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function formatMins(mins) {
  if (!mins) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function row(label, value) {
  if (!value) return ''
  return `
    <tr>
      <td style="padding:7px 0;color:#999;font-size:12px;width:150px;vertical-align:top;white-space:nowrap">${label}</td>
      <td style="padding:7px 0;color:#111;font-size:12px;font-weight:600;vertical-align:top">${value}</td>
    </tr>`
}

function check(label, passed) {
  return `<span style="display:inline-block;background:${passed ? '#f0fdf4' : '#fafafa'};border:1px solid ${passed ? '#bbf7d0' : '#e5e5e5'};border-radius:20px;padding:5px 13px;font-size:11px;font-weight:600;color:${passed ? '#15803d' : '#aaa'};margin:0 6px 6px 0">${passed ? '✓' : '✗'} ${label}</span>`
}

function header(subtitle) {
  return `
    <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:28px 32px 24px;text-align:center">
      <img src="https://cna-opsboard.vercel.app/cna-logo.png" alt="CNA" width="160" style="display:inline-block;background:#fff;padding:8px 12px;border-radius:6px;margin-bottom:16px" />
      <p style="margin:0;color:#555;font-size:11px;letter-spacing:2.5px;text-transform:uppercase">${subtitle}</p>
    </td></tr>`
}

function footer() {
  return `
    <tr><td style="padding:24px 0;text-align:center">
      <p style="margin:0;color:#ccc;font-size:11px">CNA OpsBoard &nbsp;·&nbsp; YS-CNA &nbsp;·&nbsp; Bell 206B3 JetRanger</p>
    </td></tr>`
}

function formatEmergencyContact(ec) {
  if (!ec) return null
  // Support both old string format and new { dial_code, number } object
  if (typeof ec === 'string') return ec.trim() || null
  const num = (ec.number ?? '').trim()
  if (!num) return null
  return ec.dial_code ? `${ec.dial_code} ${num}` : num
}

function paxTable(list) {
  if (!list || list.length === 0) return ''
  // Handle both {weight_lbs} and {weight} key names
  const rows = list.map(p => {
    const w  = p.weight_lbs ?? p.weight ?? null
    const ec = formatEmergencyContact(p.emergency_contact)
    const em = (p.email ?? '').trim() || null
    return `
    <tr>
      <td style="padding:6px 0 2px;color:#111;font-size:12px;font-weight:600">${p.name || '—'}</td>
      <td style="padding:6px 0 2px;color:#888;font-size:12px;text-align:right;vertical-align:top">${w ? w + ' lbs' : '—'}</td>
    </tr>
    ${ec ? `<tr>
      <td colspan="2" style="padding:0 0 3px;color:#aaa;font-size:11px">
        Emergency contact: <span style="color:#555;font-weight:500">${ec}</span>
      </td>
    </tr>` : ''}
    ${em ? `<tr>
      <td colspan="2" style="padding:0 0 6px;color:#aaa;font-size:11px">
        Email: <span style="color:#555;font-weight:500">${em}</span>
      </td>
    </tr>` : ''}`
  }).join('')
  return `
    <div style="margin-top:24px;border-top:1px solid #f0f0f0;padding-top:20px">
      <p style="margin:0 0 10px;color:#aaa;font-size:10px;letter-spacing:2.5px;text-transform:uppercase">Passengers</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </div>`
}

// ── Email builders ─────────────────────────────────────────────────────────────

function buildFlightEmail(d) {
  const legs  = d.legs ?? []

  // Build route string from correct field names
  const route = legs.length > 0
    ? legs.map(l => [l.takeoff_location, l.landing_location].filter(Boolean).join(' → ')).filter(Boolean).join(' · ') || '—'
    : '—'

  // Build per-leg adjustment notes (only when air time was manually adjusted)
  const adjustmentRows = legs
    .filter(l => l.actual_minutes != null && l.wait_note)
    .map(l => `
      <tr>
        <td style="padding:5px 0;color:#999;font-size:12px;vertical-align:top;white-space:nowrap">
          ${l.takeoff_location || '?'} → ${l.landing_location || '?'}
        </td>
        <td style="padding:5px 0;color:#555;font-size:12px;vertical-align:top">${l.wait_note}</td>
      </tr>`)
    .join('')

  const adjustmentSection = adjustmentRows ? `
    <div style="margin-top:24px;border-top:1px solid #f0f0f0;padding-top:20px">
      <p style="margin:0 0 10px;color:#aaa;font-size:10px;letter-spacing:2.5px;text-transform:uppercase">Ground Wait Notes</p>
      <table width="100%" cellpadding="0" cellspacing="0">${adjustmentRows}</table>
    </div>` : ''

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:40px 16px">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
  ${header('Flight Log &nbsp;·&nbsp; New Entry')}
  <tr><td style="background:#fff;padding:32px;border-radius:0 0 12px 12px">

    <div style="background:#f7f7f7;border-radius:10px;padding:18px 20px;margin-bottom:26px">
      <p style="margin:0;color:#aaa;font-size:10px;letter-spacing:2.5px;text-transform:uppercase">Route</p>
      <p style="margin:8px 0 0;color:#111;font-size:17px;font-weight:700">${route}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${row('Pilot in Command', d.pilot)}
      ${d.copilot ? row('Co-Pilot', d.copilot) : ''}
      ${row('Date', formatDate(d.date))}
      ${row('Aircraft', 'YS-CNA &nbsp;·&nbsp; Bell 206B3')}
      ${row('Air Time', formatMins(d.total_minutes))}
      ${row('Flight Time', formatMins(d.flight_time_minutes))}
      ${row('Fuel Consumed', d.fuel_consumed_gal != null ? d.fuel_consumed_gal + ' gal' : null)}
      ${row('Notes', d.notes)}
    </table>

    ${adjustmentSection}
    ${paxTable(d.passengers)}

  </td></tr>
  ${footer()}
</table></td></tr></table>
</body></html>`
}

function buildItineraryEmail(d) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:40px 16px">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
  ${header('Flight Itinerary &nbsp;·&nbsp; Submitted')}
  <tr><td style="background:#fff;padding:32px;border-radius:0 0 12px 12px">

    <div style="background:#f7f7f7;border-radius:10px;padding:18px 20px;margin-bottom:26px">
      <p style="margin:0;color:#aaa;font-size:10px;letter-spacing:2.5px;text-transform:uppercase">Route</p>
      <p style="margin:8px 0 0;color:#111;font-size:17px;font-weight:700">${d.departure_icao || '—'}</p>
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${row('Pilot in Command', d.pilot_in_command)}
      ${d.copilot ? row('Co-Pilot', d.copilot) : ''}
      ${row('Date', formatDate(d.date))}
      ${row('Aircraft', 'YS-CNA &nbsp;·&nbsp; Bell 206B3')}
      ${row('Departure Time', d.departure_time)}
      ${row('ETE', d.ete)}
      ${row('Fuel on Board', d.fuel_on_board ? d.fuel_on_board + ' gal' : null)}
      ${row('Notes', d.additional_comments)}
    </table>

    <div style="margin-top:20px">
      ${check('Daily Inspection', d.daily_inspection)}
      ${check('Weight & Balance', d.weight_and_balance)}
    </div>

    ${paxTable(d.pax)}

  </td></tr>
  ${footer()}
</table></td></tr></table>
</body></html>`
}

// ── Send via Resend ────────────────────────────────────────────────────────────

async function sendEmail(subject, html, recipients) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: recipients, subject, html }),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Resend error: ${text}`)
  }
  return resp.json()
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body ?? {}

  // Only the Supabase DB webhook may call this endpoint. The old unauthenticated
  // { type, data } client path was removed on 2026-08-22 (see AUDIT.md Phase 4).
  const secret = req.headers['x-webhook-secret']
  if (!process.env.WEBHOOK_SECRET || secret !== process.env.WEBHOOK_SECRET.trim()) {
    console.error('[webhook] Unauthorized — secret mismatch')
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!body.record) return res.status(400).json({ error: 'Expected a database webhook payload' })

  // Map Supabase table name → notification type
  const tableMap = { flights: 'flight_log', flight_itineraries: 'itinerary' }
  const type = tableMap[body.table]
  if (!type) {
    console.error('[webhook] Unknown table:', body.table)
    return res.status(400).json({ error: 'Unknown table' })
  }
  // Only fire on INSERT (not UPDATE/DELETE)
  if (body.type !== 'INSERT') {
    return res.status(200).json({ ok: true, skipped: 'not an insert' })
  }

  // Escape every user-entered string before it touches HTML
  const data = deepEscape(body.record)

  if (!type || !data) return res.status(400).json({ error: 'Missing type or data' })

  const isItinerary = type === 'itinerary'
  const subject = isItinerary
    ? `Flight Itinerary — ${data.pilot_in_command ?? ''} · ${data.date ?? ''}`
    : `Flight Log — ${data.pilot ?? ''} · ${data.date ?? ''}`

  const html = isItinerary ? buildItineraryEmail(data) : buildFlightEmail(data)
  const recipients = isItinerary ? RECIPIENTS_ITINERARY : RECIPIENTS_FLIGHT_LOG

  try {
    await sendEmail(subject, html, recipients)
    console.log(`[notify] Sent ${type} email for ${data.date}`)
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('[notify] Failed:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
