// CNA OS — Push notification Edge Function
// Triggered when a task is assigned; sends Web Push to the assignee's device.

import { serve }        from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush          from 'npm:web-push@3.6.7'

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

webpush.setVapidDetails('mailto:ops@cielonorteaviacion.com', VAPID_PUBLIC, VAPID_PRIVATE)

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { assignee, title, due_date, assigned_by } = await req.json()

    if (!assignee || !title) {
      return new Response(JSON.stringify({ error: 'assignee and title required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
    const { data: rows } = await supabase
      .from('device_tokens')
      .select('subscription')
      .eq('name', assignee)

    if (!rows?.length) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no token found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const bodyText = due_date
      ? `${title} · Due ${formatDate(due_date)}`
      : title

    const payload = JSON.stringify({
      title: '📋 Task Assigned to You',
      body:  bodyText,
      url:   '/employees',
    })

    let sent = 0
    for (const { subscription } of rows) {
      try {
        await webpush.sendNotification(subscription, payload)
        sent++
      } catch (e) {
        // Expired or invalid subscription — clean it up
        console.error('Push failed for', assignee, ':', e.message)
        if (e.statusCode === 410 || e.statusCode === 404) {
          await supabase
            .from('device_tokens')
            .delete()
            .eq('name', assignee)
        }
      }
    }

    return new Response(JSON.stringify({ sent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
