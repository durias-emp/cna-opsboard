// Frosted glass, portable version (extracted from AVIARA). Pairs with the
// glass tokens in index.css.
//
// THE ONE IDEA: there is a single number. Blur is derived from it rather than
// being a second control — transparency lets the background through, blur is
// what keeps text readable, and exposing them separately lets someone pick a
// pair that cannot be read.
//
// JS owns the number and writes --glass-opacity / --glass-blur; CSS owns the
// panel colour. OpsBoard is a single-theme (dark) app, so there is one
// --glass-rgb, declared in index.css.

export const GLASS_MIN = 0
export const GLASS_MAX = 100
// Tuned by eye against OpsBoard's dashboard and the MapLibre chart — denser
// than AVIARA's 10 because our capsule floats over live map labels.
export const DEFAULT_GLASS = 45

const MAX_BLUR_PX = 32
const blurFor = pct => Math.round(MAX_BLUR_PX * (1 - pct / 100))

export function clampGlass(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULT_GLASS
  return Math.max(GLASS_MIN, Math.min(GLASS_MAX, Math.round(n)))
}

function paint(pct) {
  const root = document.documentElement
  const v = clampGlass(pct)
  root.style.setProperty('--glass-opacity', String(v / 100))
  root.style.setProperty('--glass-blur', `${blurFor(v)}px`)
}

let currentPct = DEFAULT_GLASS

export function applyGlass(pct) {
  currentPct = clampGlass(pct)
  paint(currentPct)
}

const KEY_GLASS = 'cna:glass'

// Call before first paint (module scope in main.jsx, NOT an effect — an
// effect runs after paint and the user sees the panel jump).
export function loadGlass() {
  let v = DEFAULT_GLASS
  try {
    v = clampGlass(localStorage.getItem(KEY_GLASS) ?? DEFAULT_GLASS)
  } catch { /* private mode: shipped look is the right fallback */ }
  currentPct = v
  paint(v)
  return v
}

export function saveGlass(pct) {
  const v = clampGlass(pct)
  applyGlass(v)
  try { localStorage.setItem(KEY_GLASS, String(v)) } catch { /* nothing to do */ }
  return v
}

export const getGlass = () => currentPct
