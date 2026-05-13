const RECIPIENTS = ['info@cielonorteaviacion.com', 'james@cielonorteaviacion.com']
const FROM = 'CNA OpsBoard <ops@cielonorteaviacion.com>'

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
    <tr><td style="background:#0a0a0a;border-radius:12px 12px 0 0;padding:24px 32px 20px">
      <img src="https://cna-opsboard.vercel.app/cna-logo.png" alt="CNA" width="160" style="display:block;filter:invert(1);opacity:0.95;margin-bottom:14px" />
      <p style="margin:0;color:#555;font-size:11px;letter-spacing:2.5px;text-transform:uppercase">${subtitle}</p>
    </td></tr>`
}

function footer() {
  return `
    <tr><td style="padding:24px 0;text-align:center">
      <p style="margin:0;color:#ccc;font-size:11px">CNA OpsBoard &nbsp;·&nbsp; C-GOPF &nbsp;·&nbsp; Bell 206B3 JetRanger</p>
    </td></tr>`
}

function paxTable(list) {
  if (!list || list.length === 0) return ''
  const nameKey   = list[0].name       !== undefined ? 'name'       : 'name'
  const weightKey = list[0].weight_lbs !== undefined ? 'weight_lbs' : 'weight'
  const rows = list.map(p => `
    <tr>
      <td style="padding:5px 0;color:#111;font-size:12px">${p.name || '—'}</td>
      <td style="padding:5px 0;color:#888;font-size:12px;text-align:right">${p[weightKey] ? p[weightKey] + ' lbs' : '—'}</td>
    </tr>`).join('')
  return `
    <div style="margin-top:24px;border-top:1px solid #f0f0f0;padding-top:20px">
      <p style="margin:0 0 10px;color:#aaa;font-size:10px;letter-spacing:2.5px;text-transform:uppercase">Passengers</p>
      <table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    </div>`
}

function buildFlightEmail(d) {
  const legs  = d.legs ?? []
  const route = legs.length > 0
    ? legs.map(l => [l.origin_icao, l.destination_icao].filter(Boolean).join(' → ')).join(' · ')
    : '—'

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
      ${row('Pilot', d.pilot)}
      ${row('Date', formatDate(d.date))}
      ${row('Aircraft', 'C-GOPF &nbsp;·&nbsp; Bell 206B3')}
      ${row('Flight Time', formatMins(d.total_minutes))}
      ${row('Fuel Consumed', d.fuel_consumed_gal != null ? d.fuel_consumed_gal + ' gal' : null)}
      ${row('Notes', d.notes)}
    </table>

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
      ${row('Date', formatDate(d.date))}
      ${row('Aircraft', 'C-GOPF &nbsp;·&nbsp; Bell 206B3')}
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { type, data } = req.body ?? {}
  if (!type || !data) return res.status(400).json({ error: 'Missing type or data' })

  const isItinerary = type === 'itinerary'
  const subject = isItinerary
    ? `✈ Flight Itinerary — ${data.pilot_in_command ?? ''} · ${data.date ?? ''}`
    : `✈ Flight Log — ${data.pilot ?? ''} · ${data.date ?? ''}`

  const html = isItinerary ? buildItineraryEmail(data) : buildFlightEmail(data)

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: FROM, to: RECIPIENTS, subject, html }),
    })

    if (!resp.ok) {
      const text = await resp.text()
      console.error('Resend error:', text)
      return res.status(502).json({ error: text })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('send-notification error:', err)
    return res.status(500).json({ error: err.message })
  }
}
