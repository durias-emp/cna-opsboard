// Great-circle helpers for route planning and clean coordinate display.

const R_NM = 3440.065   // earth radius in nautical miles

export function haversineNm(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return 2 * R_NM * Math.asin(Math.sqrt(a))
}

// Initial great-circle bearing in degrees true, 0–360
export function initialBearingDeg(lat1, lon1, lat2, lon2) {
  const toRad = d => (d * Math.PI) / 180
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2))
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1))
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

// Accepts coordinates in every common pilot format and returns {lat, lng} or
// null. Handles: decimal ("13.975, -89.55" / "13.975 -89.55"),
// DMS (13°58'30"N 89°33'00"W — also with spaces or letters first),
// and degrees-decimal-minutes (13°58.5'N 89°33.0'W).
export function parseCoords(input) {
  if (!input) return null
  const s = String(input).trim().toUpperCase()
    .replace(/[°º]/g, ' ').replace(/[′']/g, ' ').replace(/[″"]/g, ' ')

  // Decimal pair: 13.975 -89.55 (comma or space separated)
  let m = s.match(/^(-?\d{1,3}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/)
  if (m) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2])
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng }
    return null
  }

  // Hemisphere forms: D [M [S]] N/S then D [M [S]] E/W (letters before or after)
  const half = '([NSEW])?\\s*(\\d{1,3})(?:\\s+(\\d{1,2}(?:\\.\\d+)?))?(?:\\s+(\\d{1,2}(?:\\.\\d+)?))?\\s*([NSEW])?'
  m = s.match(new RegExp(`^${half}[,\\s]+${half}$`))
  if (!m) return null
  const part = (pre, d, mm, ss, post) => {
    const h = pre || post
    if (!h) return null
    let v = parseFloat(d) + (mm ? parseFloat(mm) / 60 : 0) + (ss ? parseFloat(ss) / 3600 : 0)
    if (h === 'S' || h === 'W') v = -v
    return { v, axis: (h === 'N' || h === 'S') ? 'lat' : 'lng' }
  }
  const a = part(m[1], m[2], m[3], m[4], m[5])
  const b = part(m[6], m[7], m[8], m[9], m[10])
  if (!a || !b || a.axis === b.axis) return null
  const lat = a.axis === 'lat' ? a.v : b.v
  const lng = a.axis === 'lng' ? a.v : b.v
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

// 13.4975, -89.8522 → 13°29'51"N 89°51'08"W
export function formatDMS(lat, lng) {
  const one = (v, pos, neg) => {
    const h = v >= 0 ? pos : neg
    const abs = Math.abs(v)
    let d = Math.floor(abs)
    const mFloat = (abs - d) * 60
    let m = Math.floor(mFloat)
    let s = Math.round((mFloat - m) * 60)
    if (s === 60) { s = 0; m += 1 }          // carry — never print 60"
    if (m === 60) { m = 0; d += 1 }
    return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"${h}`
  }
  return `${one(lat, 'N', 'S')} ${one(lng, 'E', 'W')}`
}
