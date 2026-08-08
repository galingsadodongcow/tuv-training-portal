// Sends queued emails from comms_log through Resend and marks them Sent or Failed.
// Deploy:  supabase functions deploy send-comms
// Schedule: add to pg_cron (see supabase/schedule.sql) to run every few minutes.
// Secrets needed: RESEND_API_KEY, COMMS_FROM (e.g. "Academy <portal@resend.dev>")
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('COMMS_FROM') || 'Academy Portal <portal@resend.dev>'
  if (!apiKey) return new Response(JSON.stringify({ sent: 0, reason: 'RESEND_API_KEY not set' }))

  const { data: queued, error } = await supabase
    .from('comms_log').select('*').eq('status', 'Queued').limit(50)
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  let sent = 0, failed = 0
  for (const m of queued || []) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from, to: [m.to_email], subject: m.subject,
          html: `<div style="font:14px system-ui;color:#102a43;white-space:pre-wrap">${m.body}</div>`,
        }),
      })
      if (res.ok) {
        await supabase.from('comms_log').update({ status: 'Sent', sent_at: new Date().toISOString(), error: null }).eq('comm_id', m.comm_id)
        sent++
      } else {
        const text = await res.text()
        await supabase.from('comms_log').update({ status: 'Failed', error: text.slice(0, 500) }).eq('comm_id', m.comm_id)
        failed++
      }
    } catch (e) {
      await supabase.from('comms_log').update({ status: 'Failed', error: String(e).slice(0, 500) }).eq('comm_id', m.comm_id)
      failed++
    }
  }

  return new Response(JSON.stringify({ sent, failed }), { headers: { 'Content-Type': 'application/json' } })
})
