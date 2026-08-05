// Weekly exception digest.
// Deploy:  supabase functions deploy weekly-digest
// Schedule: see supabase/schedule.sql (pg_cron) or the Supabase dashboard.
// Secrets needed: RESEND_API_KEY, DIGEST_TO (comma separated), DIGEST_FROM
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const money = (n: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(n || 0)
const day = (d: string) =>
  new Date(d).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })

function section(title: string, rows: string[], empty: string) {
  if (rows.length === 0) return `<h3 style="margin:22px 0 6px;font:600 15px system-ui">${title}</h3><p style="margin:0;color:#5b6b7a;font:14px system-ui">${empty}</p>`
  return `<h3 style="margin:22px 0 6px;font:600 15px system-ui">${title} (${rows.length})</h3>
    <table style="border-collapse:collapse;width:100%;font:14px system-ui">${rows.join('')}</table>`
}
const row = (cells: string[]) =>
  `<tr>${cells.map((c, i) => `<td style="padding:5px 8px;border-bottom:1px solid #e6ecf2;${i > 0 ? 'text-align:right;color:#5b6b7a' : ''}">${c}</td>`).join('')}</tr>`

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data, error } = await supabase.rpc('fn_weekly_digest')
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })

  const t = data.totals
  const portal = Deno.env.get('PORTAL_URL') || 'https://your-site.netlify.app'

  const html = `
  <div style="max-width:720px;margin:0 auto;padding:24px;font:14px system-ui;color:#102a43">
    <h2 style="margin:0 0 4px;font:700 20px system-ui;color:#0071b9">Academy portal, week ahead</h2>
    <p style="margin:0 0 18px;color:#5b6b7a">${new Date().toLocaleDateString('en-PH', { dateStyle: 'full' })}</p>

    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
      ${[['Sessions at risk', t.at_risk], ['Orders stalled', t.stalled], ['Roster gaps', t.roster_gaps],
         ['E-learning waiting', t.elearning_waiting], ['Unstaffed', t.unstaffed]]
        .map(([l, v]) => `<div style="border:1px solid #e6ecf2;border-radius:8px;padding:10px 14px;min-width:110px">
          <div style="font:600 22px system-ui;color:${Number(v) > 0 ? '#b3121a' : '#0b7a3b'}">${v}</div>
          <div style="color:#5b6b7a;font-size:12px">${l}</div></div>`).join('')}
    </div>

    ${section('Sessions below minimum within 21 days',
      (data.at_risk || []).map((r: any) => row([
        `<strong>${r.course_name}</strong><br><span style="color:#5b6b7a">${day(r.start_date)}</span>`,
        `${r.booked_participants}/${r.min_participants}`,
        `${r.seats_needed} to Go`,
        `${r.days_out}d out`,
      ])), 'Every upcoming session has met its minimum.')}

    ${section('Orders stuck more than 14 days',
      (data.stalled_orders || []).map((r: any) => row([
        `<strong>${r.company || r.order_id}</strong><br><span style="color:#5b6b7a">${r.fulfillment_stage} · ${r.owner || 'unassigned'}</span>`,
        money(r.total_amount),
        `${r.days_in_stage}d in stage`,
      ])), 'Nothing is stalled.')}

    ${section('Sessions missing participant names (next 14 days)',
      (data.roster_gaps || []).map((r: any) => row([
        `<strong>${r.course_name}</strong><br><span style="color:#5b6b7a">${day(r.start_date)}</span>`,
        `${r.names_captured}/${r.seats_sold} names`,
        `${r.missing} missing`,
      ])), 'Every upcoming roster is complete.')}

    ${section('Paid e-learning waiting for access',
      (data.elearning_waiting || []).map((r: any) => row([
        `<strong>${r.company || r.order_id}</strong><br><span style="color:#5b6b7a">${r.course_name || ''}</span>`,
        `${r.days_waiting}d waiting`,
      ])), 'No access requests outstanding.')}

    ${section('Sessions without a trainer (next 21 days)',
      (data.unstaffed || []).map((r: any) => row([
        `<strong>${r.course_name}</strong><br><span style="color:#5b6b7a">${day(r.start_date)}</span>`,
        `${r.days_out}d out`,
      ])), 'Every near-term session is staffed.')}

    <p style="margin:26px 0 0"><a href="${portal}" style="color:#0071b9">Open the portal</a></p>
  </div>`

  const to = (Deno.env.get('DIGEST_TO') || '').split(',').map((s) => s.trim()).filter(Boolean)
  if (to.length === 0) return new Response(JSON.stringify({ sent: false, reason: 'DIGEST_TO not set', totals: t }))

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: Deno.env.get('DIGEST_FROM') || 'Academy Portal <portal@resend.dev>',
      to,
      subject: `Academy portal: ${t.at_risk} at risk, ${t.stalled} stalled, ${t.elearning_waiting} waiting access`,
      html,
    }),
  })

  return new Response(JSON.stringify({ sent: res.ok, totals: t }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
