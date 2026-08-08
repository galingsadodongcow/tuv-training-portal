'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useInvalidate, useOpenExceptions } from '../hooks/data'
import { useToast } from '../components/Toast'
import { php, shortDate } from '../lib/format'

// Accepts a SAP export pasted or uploaded as CSV.
// Needs two columns: the webshop order reference and the SAP order number.
// Optional third column sets payment status.
function parseCsv(text: string) {
  const rows = text.trim().split(/\r?\n/).map((line) => {
    const out: string[] = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
      else if ((ch === ',' || ch === '\t' || ch === ';') && !inQ) { out.push(cur); cur = '' }
      else cur += ch
    }
    out.push(cur)
    return out.map((c) => c.trim())
  })
  return rows.filter((r) => r.some((c) => c))
}

const SAP_FORMAT = /^\d{6,12}$/

// One place that decides what state a staged row is in, so the review table,
// the counts, and the commit all agree.
type RowState = 'ready' | 'unchanged' | 'not_found' | 'invalid'
const STATE_LABEL: Record<RowState, string> = {
  ready: 'Ready to apply',
  unchanged: 'Already set',
  not_found: 'Not in portal',
  invalid: 'Invalid SAP number',
}
const STATE_PILL: Record<RowState, string> = {
  ready: 'pill-go',
  unchanged: 'pill-cancelled',
  not_found: 'pill-nogo',
  invalid: 'pill-nogo',
}

export default function SapImport() {
  const { profile } = useAuth()
  const invalidate = useInvalidate()
  const toast = useToast()
  const exceptions = useOpenExceptions()
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<any[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<any>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const role = profile?.role
  const allowed = ['operations', 'super_admin'].includes(role as string)
  const isAdmin = role === 'super_admin'

  const build = async () => {
    setMsg(null); setDone(null)
    const rows = parseCsv(raw)
    if (rows.length < 2) { setMsg('Paste at least a header row and one data row.'); return }
    const head = rows[0].map((h) => h.toLowerCase())
    const iRef = head.findIndex((h) => /order|webshop|reference|ref/.test(h) && !/sap/.test(h))
    const iSap = head.findIndex((h) => /sap/.test(h))
    const iPay = head.findIndex((h) => /pay|status|collect/.test(h))
    if (iRef === -1 || iSap === -1) {
      setMsg('Could not find both an order reference column and a SAP column in the header row.')
      return
    }
    const parsed = rows.slice(1).map((r) => ({
      order_id: (r[iRef] || '').replace(/\.0$/, ''),
      sap: (r[iSap] || '').trim(),
      pay: iPay > -1 ? (r[iPay] || '').trim() : '',
    })).filter((r) => r.order_id && r.sap)

    const ids = [...new Set(parsed.map((p) => p.order_id))]
    const { data: found } = await supabase
      .from('orders')
      .select('order_id, sap_order_no, fulfillment_stage, total_amount, client:client_id(company, name)')
      .in('order_id', ids)
    const map = new Map<string, any>((found || []).map((o: any) => [o.order_id, o]))

    setPreview(parsed.map((p) => {
      const o = map.get(p.order_id)
      let state: RowState
      if (!o) state = 'not_found'
      else if (!SAP_FORMAT.test(p.sap)) state = 'invalid'
      else if (o.sap_order_no === p.sap) state = 'unchanged'
      else state = 'ready'
      return {
        ...p,
        state,
        exists: !!o,
        company: o?.client?.company || o?.client?.name || '',
        amount: o?.total_amount,
        current: o?.sap_order_no || '',
      }
    }))
  }

  // Record a bad or unmatched row so it survives the import for follow-up.
  // Only the super admin can write exceptions (RLS), so operations sees the
  // reconciliation but the persisted worklist is the admin's.
  const logExceptions = async (rows: any[]) => {
    if (!isAdmin || rows.length === 0) return 0
    const payload = rows.map((p) => ({
      source: 'sap_import',
      reason: p.state === 'not_found' ? `Order ${p.order_id} not in portal` : p.state === 'invalid' ? `Invalid SAP number "${p.sap}"` : `Update failed for ${p.order_id}`,
      raw: { order_id: p.order_id, sap: p.sap, pay: p.pay, state: p.state },
    }))
    const { error } = await supabase.from('import_exception').insert(payload)
    if (error) { toast.error(`Could not log exceptions: ${error.message}`); return 0 }
    return payload.length
  }

  const apply = async () => {
    if (!preview) return
    setBusy(true); setMsg(null)
    const ready = preview.filter((p) => p.state === 'ready')
    const problems = preview.filter((p) => p.state === 'not_found' || p.state === 'invalid')
    const failed: any[] = []
    let ok = 0
    for (const p of ready) {
      const patch: any = { sap_order_no: p.sap }
      const pay = p.pay.toLowerCase()
      if (pay.includes('collect') || pay === 'paid') patch.payment_status = 'Paid'
      else if (pay.includes('partial')) patch.payment_status = 'Partial'
      const { error } = await supabase.from('orders').update(patch).eq('order_id', p.order_id)
      if (error) failed.push(p); else ok++
    }
    const logged = await logExceptions([...problems, ...failed])
    invalidate(['orders', 'fulfillment_queue', 'open_exceptions'])
    if (ok > 0) toast.success(`${ok} order(s) updated.`)
    if (failed.length > 0) toast.error(`${failed.length} failed.`)
    setDone({
      ok,
      failed: failed.length,
      unchanged: preview.filter((p) => p.state === 'unchanged').length,
      problems: problems.length,
      logged,
    })
    setBusy(false)
  }

  const resolve = async (id: string) => {
    const { error } = await supabase.from('import_exception').update({ resolved: true }).eq('exception_id', id)
    if (error) toast.error(error.message)
    else { toast.success('Exception resolved.'); invalidate(['open_exceptions']) }
  }

  if (!allowed) return <div className="notice notice-error">Operations or the super admin only.</div>

  const counts = {
    read: preview?.length || 0,
    ready: preview?.filter((p) => p.state === 'ready').length || 0,
    unchanged: preview?.filter((p) => p.state === 'unchanged').length || 0,
    problems: preview?.filter((p) => p.state === 'not_found' || p.state === 'invalid').length || 0,
  }
  const openEx = exceptions.data || []

  return (
    <>
      <div className="page-head">
        <div>
          <h1>SAP import</h1>
          <p>Stage a SAP export, review every row, then apply. Rows that do not match or do not validate are held as exceptions for follow-up.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="k-label" style={{ marginBottom: 8 }}>Paste CSV, or upload a file</div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={8}
          placeholder={'Order Reference,SAP Order No,Status\n60806000000950,176152681,Collected'}
          style={{ width: '100%', fontFamily: 'ui-monospace, monospace', fontSize: 13, padding: 10,
                   border: '1px solid var(--border)', borderRadius: 8 }}
        />
        <div className="toolbar" style={{ marginTop: 10 }}>
          <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const rd = new FileReader()
            rd.onload = () => setRaw(String(rd.result || ''))
            rd.readAsText(f)
          }} />
          <button className="btn btn-sm" onClick={build} disabled={!raw.trim()}>Stage &amp; review</button>
        </div>
        <div className="fill-label" style={{ marginTop: 8 }}>
          The header row needs a column naming the order reference and one naming SAP. A payment or status column is optional.
        </div>
      </div>

      {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

      {done && (
        <div className="notice notice-info" style={{ marginBottom: 16 }}>
          {done.ok} order{done.ok === 1 ? '' : 's'} updated
          {done.unchanged > 0 && `, ${done.unchanged} already set`}
          {done.problems > 0 && `, ${done.problems} held as exceptions`}
          {done.failed > 0 && `, ${done.failed} failed`}
          {done.logged > 0 && ` · ${done.logged} written to the exceptions worklist`}
          {done.problems > 0 && !isAdmin && ' · ask the super admin to review exceptions'}.
        </div>
      )}

      {preview && (
        <>
          <div className="grid kpis" style={{ marginBottom: 16 }}>
            <div className="card card-pad kpi"><div className="k-label">Rows read</div><div className="k-value">{counts.read}</div></div>
            <div className="card card-pad kpi"><div className="k-label">Ready to apply</div><div className="k-value">{counts.ready}</div></div>
            <div className="card card-pad kpi"><div className="k-label">Already set</div><div className="k-value">{counts.unchanged}</div></div>
            <div className="card card-pad kpi"><div className="k-label">Problems</div>
              <div className="k-value" style={{ color: counts.problems ? 'var(--tr-amber)' : 'inherit' }}>{counts.problems}</div></div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Order</th><th>Customer</th><th>Current SAP</th><th>New SAP</th><th className="right">Amount</th><th>State</th></tr></thead>
              <tbody>
                {preview.slice(0, 300).map((p, i) => (
                  <tr key={i} className={p.state === 'not_found' || p.state === 'invalid' ? 'risk-amber' : ''}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.order_id}</td>
                    <td>{p.company || <span className="muted">—</span>}</td>
                    <td className="fill-label">{p.current || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{p.sap}</td>
                    <td className="right">{p.amount != null ? php(p.amount) : '—'}</td>
                    <td><span className={`pill ${STATE_PILL[p.state as RowState]}`}>{STATE_LABEL[p.state as RowState]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="toolbar" style={{ marginBottom: 24 }}>
            <button className="btn" onClick={apply} disabled={busy || (counts.ready === 0 && counts.problems === 0)}>
              {busy ? 'Applying…' : `Apply ${counts.ready} update${counts.ready === 1 ? '' : 's'}${counts.problems ? ` · hold ${counts.problems}` : ''}`}
            </button>
            <button className="btn btn-ghost" onClick={() => { setPreview(null); setRaw(''); setDone(null) }}>Clear</button>
          </div>
        </>
      )}

      <div className="page-head" style={{ marginBottom: 12 }}>
        <div><h1 style={{ fontSize: 18 }}>Open exceptions{openEx.length ? ` (${openEx.length})` : ''}</h1></div>
      </div>
      <div className="card">
        {exceptions.isLoading ? (
          <div className="empty">Loading…</div>
        ) : openEx.length === 0 ? (
          <div className="empty">No open exceptions. Imports that do not match or validate land here.</div>
        ) : (
          <table>
            <thead><tr><th>Reason</th><th>Source</th><th>Details</th><th>Age</th><th></th></tr></thead>
            <tbody>
              {openEx.map((e: any) => (
                <tr key={e.exception_id}>
                  <td style={{ fontWeight: 600 }}>{e.reason}</td>
                  <td className="fill-label">{e.source}</td>
                  <td className="fill-label" style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                    {e.raw ? JSON.stringify(e.raw) : '—'}
                  </td>
                  <td className="fill-label">{shortDate(e.created_at)}</td>
                  <td className="right">
                    {isAdmin ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => resolve(e.exception_id)}>Resolve</button>
                    ) : (
                      <span className="fill-label">super admin resolves</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
