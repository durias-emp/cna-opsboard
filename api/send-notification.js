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

// ── Task assignment ────────────────────────────────────────────────────────────

// The routing brain: the assignee's email lives in team_profiles. Reads with
// the anon key (the table is open-read under RLS, same as the app itself).
async function lookupEmail(name) {
  const base = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '').replace(/\/$/, '')
  const key  = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY
  if (!base || !key || !name) return null
  const resp = await fetch(
    `${base}/rest/v1/team_profiles?name=eq.${encodeURIComponent(name)}&select=email`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  if (!resp.ok) return null
  const rows = await resp.json()
  return rows?.[0]?.email ?? null
}

const PRIORITY_COLORS = { high: '#B3261E', medium: '#8F6400', low: '#15803d' }

function buildTaskEmail(d) {
  const pr = String(d.priority ?? '').toLowerCase()
  const prColor = PRIORITY_COLORS[pr] ?? '#555'
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;padding:0;background:#f2f2f2;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f2f2;padding:40px 16px">
<tr><td align="center"><table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%">
  ${header('Task &nbsp;·&nbsp; Assigned to You')}
  <tr><td style="background:#fff;padding:32px;border-radius:0 0 12px 12px">

    <div style="background:#f7f7f7;border-radius:10px;padding:18px 20px;margin-bottom:26px">
      <p style="margin:0;color:#aaa;font-size:10px;letter-spacing:2.5px;text-transform:uppercase">Task</p>
      <p style="margin:8px 0 0;color:#111;font-size:17px;font-weight:700">${d.title ?? ''}</p>
      ${d.description ? `<p style="margin:8px 0 0;color:#555;font-size:13px;line-height:1.5">${d.description}</p>` : ''}
    </div>

    <table width="100%" cellpadding="0" cellspacing="0">
      ${row('Assigned To', d.assigned_to)}
      ${row('Assigned By', d.created_by)}
      ${d.priority ? row('Priority', `<span style="color:${prColor};text-transform:capitalize">${d.priority}</span>`) : ''}
      ${row('Category', d.category)}
      ${row('Due', d.due_date ? formatDate(d.due_date) : null)}
    </table>

    <div style="margin-top:26px;text-align:center">
      <a href="https://cna-opsboard.vercel.app" style="display:inline-block;background:#0a0a0a;color:#fff;font-size:13px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none">Open OpsBoard</a>
    </div>

  </td></tr>
  ${footer()}
</table></td></tr></table>
</body></html>`
}

// ── Send via Resend ────────────────────────────────────────────────────────────

// HTML-only email is a classic spam signal — every send carries a plain-text
// alternative, derived from the HTML when no explicit text is given.
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim()
}

async function sendEmail(subject, html, recipients, text) {
  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM, to: recipients, subject, html, text: text ?? htmlToText(html) }),
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
  const tableMap = { flights: 'flight_log', flight_itineraries: 'itinerary', todos: 'task' }
  const type = tableMap[body.table]
  if (!type) {
    console.error('[webhook] Unknown table:', body.table)
    return res.status(400).json({ error: 'Unknown table' })
  }

  // Tasks notify on assignment: an INSERT that arrives assigned, or an UPDATE
  // that changes assigned_to. Everything else fires on INSERT only.
  if (type === 'task') {
    const assignee   = body.record?.assigned_to
    const reassigned = body.type === 'UPDATE' && body.old_record?.assigned_to !== assignee
    const fresh      = body.type === 'INSERT'
    if (!assignee || !(fresh || reassigned)) {
      return res.status(200).json({ ok: true, skipped: 'no new assignment' })
    }
  } else if (body.type !== 'INSERT') {
    return res.status(200).json({ ok: true, skipped: 'not an insert' })
  }

  // Escape every user-entered string before it touches HTML
  const data = deepEscape(body.record)

  if (!type || !data) return res.status(400).json({ error: 'Missing type or data' })

  if (type === 'task') {
    // Smart routing: the email goes to the assignee alone (raw name for the
    // lookup — deepEscape is for HTML, not for matching)
    const email = await lookupEmail(body.record.assigned_to)
    if (!email) {
      console.log(`[notify] No email on file for "${body.record.assigned_to}" — task email skipped`)
      return res.status(200).json({ ok: true, skipped: 'assignee has no email' })
    }
    try {
      await sendEmail('Task Assigned', buildTaskEmail(data), [email])
      console.log(`[notify] Task email sent to ${data.assigned_to}`)
      return res.status(200).json({ ok: true })
    } catch (err) {
      console.error('[notify] Failed:', err.message)
      return res.status(500).json({ error: err.message })
    }
  }

  const isItinerary = type === 'itinerary'
  const subject = isItinerary ? 'Flight Itinerary' : 'Flight Log'

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
