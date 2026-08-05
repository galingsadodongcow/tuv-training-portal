'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useInvalidate } from '../hooks/data'
import { php } from '../lib/format'

// Accepts a SAP export pasted or uploaded as CSV.
// Needs two columns: the webshop order reference and the SAP order number.
// Optional third column sets payment status.
function parseCsv(text) {
  const rows = text.trim().split(/\r?\n/).map((line) => {
    const out = []
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

export default function SapImport() {
  const { profile } = useAuth()
  const invalidate = useInvalidate()
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [msg, setMsg] = useState(null)

  const allowed = ['operations', 'super_admin'].includes(profile?.role)

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
      return {
        ...p,
        exists: !!o,
        company: o?.client?.company || o?.client?.name || '',
        amount: o?.total_amount,
        current: o?.sap_order_no || '',
        changed: !!o && o.sap_order_no !== p.sap,
      }
    }))
  }

  const apply = async () => {
    setBusy(true); setMsg(null)
    const toApply = preview.filter((p) => p.exists && p.changed)
    let ok = 0, fail = 0
    for (const p of toApply) {
      const patch: any = { sap_order_no: p.sap }
      const pay = p.pay.toLowerCase()
      if (pay.includes('collect') || pay === 'paid') patch.payment_status = 'Paid'
      else if (pay.includes('partial')) patch.payment_status = 'Partial'
      const { error } = await supabase.from('orders').update(patch).eq('order_id', p.order_id)
      if (error) fail++; else ok++
    }
    invalidate(['orders', 'fulfillment_queue'])
    setDone({ ok, fail, skipped: preview.length - toApply.length })
    setBusy(false)
  }

  if (!allowed) return <div className="notice notice-error">Operations or the super admin only.</div>

  const matched = preview?.filter((p) => p.exists).length || 0
  const missing = preview?.filter((p) => !p.exists) || []
  const changed = preview?.filter((p) => p.exists && p.changed).length || 0

  return (
    <>
      <div className="page-head">
        <div>
          <h1>SAP import</h1>
          <p>Drop a SAP export and the portal fills in order numbers in bulk. Entering a SAP number moves the order to SAP Created on its own.</p>
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
                   border: '1px solid var(--tr-line)', borderRadius: 8 }}
        />
        <div className="toolbar" style={{ marginTop: 10 }}>
          <input type="file" accept=".csv,.txt,.tsv" onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            const rd = new FileReader()
            rd.onload = () => setRaw(String(rd.result || ''))
            rd.readAsText(f)
          }} />
          <button className="btn btn-sm" onClick={build} disabled={!raw.trim()}>Preview</button>
        </div>
        <div className="fill-label" style={{ marginTop: 8 }}>
          The header row needs a column naming the order reference and one naming SAP. A payment or status column is optional.
        </div>
      </div>

      {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

      {done && (
        <div className="notice notice-info" style={{ marginBottom: 16 }}>
          {done.ok} order{done.ok === 1 ? '' : 's'} updated
          {done.fail > 0 && `, ${done.fail} failed`}
          {done.skipped > 0 && `, ${done.skipped} skipped as already correct or not found`}.
        </div>
      )}

      {preview && (
        <>
          <div className="grid kpis" style={{ marginBottom: 16 }}>
            <div className="card card-pad kpi"><div className="k-label">Rows read</div><div className="k-value">{preview.length}</div></div>
            <div className="card card-pad kpi"><div className="k-label">Matched orders</div><div className="k-value">{matched}</div></div>
            <div className="card card-pad kpi"><div className="k-label">Will update</div><div className="k-value">{changed}</div></div>
            <div className="card card-pad kpi"><div className="k-label">Not found</div>
              <div className="k-value" style={{ color: missing.length ? 'var(--tr-amber)' : 'inherit' }}>{missing.length}</div></div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Order</th><th>Customer</th><th>Current SAP</th><th>New SAP</th><th className="right">Amount</th><th></th></tr></thead>
              <tbody>
                {preview.slice(0, 200).map((p, i) => (
                  <tr key={i} className={!p.exists ? 'risk-amber' : ''}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{p.order_id}</td>
                    <td>{p.company || <span className="muted">—</span>}</td>
                    <td className="fill-label">{p.current || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{p.sap}</td>
                    <td className="right">{p.amount != null ? php(p.amount) : '—'}</td>
                    <td className="fill-label">
                      {!p.exists ? 'not in portal' : p.changed ? 'will update' : 'already set'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="toolbar">
            <button className="btn" onClick={apply} disabled={busy || changed === 0}>
              {busy ? 'Applying…' : `Apply ${changed} update${changed === 1 ? '' : 's'}`}
            </button>
            <button className="btn btn-ghost" onClick={() => { setPreview(null); setRaw(''); setDone(null) }}>Clear</button>
          </div>
        </>
      )}
    </>
  )
}
