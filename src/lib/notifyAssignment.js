import { getAccessToken } from '../context/AuthContext'

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`
// Edge Functions require the classic JWT anon key, not the publishable key
const ANON_KEY =  import.meta.env.VITE_SUPABASE_ANON_JWT

/**
 * Fire-and-forget — sends a push notification to the assigned person's device.
 * Never throws; silently swallows errors so save flow is never blocked.
 */
export async function notifyAssignment({ assignee, title, dueDate, assignedBy }) {
  if (!assignee) return
  try {
    // With login enabled the user's own token is sent, and the Edge Function
    // rejects plain anon calls — random internet callers can't push to staff phones.
    const token = (await getAccessToken()) ?? ANON_KEY
    await fetch(EDGE_URL, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ assignee, title, due_date: dueDate ?? null, assigned_by: assignedBy ?? null }),
    })
  } catch {
    // Notification failures are silent — never block the main flow
  }
}
