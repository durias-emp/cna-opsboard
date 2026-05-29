const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`
const ANON_KEY =  import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Fire-and-forget — sends a push notification to the assigned person's device.
 * Never throws; silently swallows errors so save flow is never blocked.
 */
export async function notifyAssignment({ assignee, title, dueDate, assignedBy }) {
  if (!assignee) return
  try {
    await fetch(EDGE_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${ANON_KEY}`,
      },
      body: JSON.stringify({ assignee, title, due_date: dueDate ?? null, assigned_by: assignedBy ?? null }),
    })
  } catch {
    // Notification failures are silent — never block the main flow
  }
}
