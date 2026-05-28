/**
 * Shared utility functions used across the app.
 * Import from here instead of re-defining locally.
 */

/** Convert flight minutes to hobbs hours (1 hobbs = 6 min) */
export const toHobbs = mins => Math.round(mins / 6) / 10

/** Round to 2 decimal places */
export const round2 = n => Math.round(n * 100) / 100

/** Format an ISO date string (YYYY-MM-DD) to a readable label e.g. "May 28, 2026" */
export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso + 'T12:00:00').toLocaleDateString('en-CA', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
