import { useState, useEffect, useCallback } from 'react'

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbz7N3w6Jkm_jRaJ-SVhKfe42JgXurdd5CGlTNNLStqI0dxOXzwJRhWiClh2Ha28mqIdFQ/exec'

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Returns events for a single date: [{ title, start, end }]
async function fetchDay(dateStr) {
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?date=${dateStr}`)
    const data = await res.json()
    return (data.busy ?? []).map(ev => ({
      title: ev.title ?? 'Event',
      start: ev.start,
      end:   ev.end,
      date:  dateStr,
    }))
  } catch {
    return []
  }
}

// Fetches the next `days` days starting from today
export function useGoogleCalendar(days = 3) {
  const [events,  setEvents]  = useState({})   // { 'YYYY-MM-DD': [event, ...] }
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const base = new Date(); base.setHours(0, 0, 0, 0)

    const dates = Array.from({ length: days }, (_, i) => {
      const d = new Date(base)
      d.setDate(d.getDate() + i)
      return toDateStr(d)
    })

    const results = await Promise.all(dates.map(d => fetchDay(d)))

    const map = {}
    dates.forEach((d, i) => { map[d] = results[i] })
    setEvents(map)
    setLoading(false)
  }, [days])

  useEffect(() => { load() }, [load])

  return { events, loading, refresh: load }
}
