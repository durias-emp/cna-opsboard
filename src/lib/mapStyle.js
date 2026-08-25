// AVIARA's map skin: OpenFreeMap vector tiles, dark style. Fetched once per
// session and shared by every map instance (the style server rate-limits
// repeat fetches — AVIARA lesson).
const STYLE_DARK = 'https://tiles.openfreemap.org/styles/dark'

let stylePromise = null
export function loadStyle() {
  if (!stylePromise) {
    stylePromise = fetch(STYLE_DARK)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .catch(() => STYLE_DARK)   // MapLibre retries the URL its own way
  }
  return stylePromise
}

export const SALVADOR_CENTER = [-88.95, 13.72]   // [lng, lat]
