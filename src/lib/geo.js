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

// 13.4975, -89.8522 → 13°29'51"N 89°51'08"W
export function formatDMS(lat, lng) {
  const one = (v, pos, neg) => {
    const h = v >= 0 ? pos : neg
    const abs = Math.abs(v)
    const d = Math.floor(abs)
    const mFloat = (abs - d) * 60
    const m = Math.floor(mFloat)
    const s = Math.round((mFloat - m) * 60)
    return `${d}°${String(m).padStart(2, '0')}'${String(s).padStart(2, '0')}"${h}`
  }
  return `${one(lat, 'N', 'S')} ${one(lng, 'E', 'W')}`
}
