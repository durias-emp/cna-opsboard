// AVIARA's map skin: OpenFreeMap vector tiles. 'liberty' is AVIARA's clear
// (light) mode — confirmed from their shipped code: dark ? 'dark' : 'liberty'.
// Fetched once per session and shared by every map instance (the style server
// rate-limits repeat fetches — AVIARA lesson).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'

let stylePromise = null
export function loadStyle() {
  if (!stylePromise) {
    stylePromise = fetch(STYLE_URL)
      .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.json() })
      .catch(() => STYLE_URL)    // MapLibre retries the URL its own way
  }
  return stylePromise
}

export const SALVADOR_CENTER = [-88.95, 13.72]   // [lng, lat]

// Sister app: flight planning lives in AVIARA
export const AVIARA_URL = 'https://aviara-sandbox.vercel.app'
