import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useFulfillmentQueue, useOrders, useSalespeople, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote, ChannelPill } from '../components/ui'
import OrderDrawer from '../components/OrderDrawer'
import { php, shortDate } from '../lib/format'

const STAGES = ['New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback']
const NEXT = {
  'New': 'In Communication',
  'In Communication': 'For Order Creation',
  'For Order Creation': 'Endorsed to Ops',
  'Endorsed to Ops': 'SAP Created',
  'No Feedback': 'In Communication',
}

export default function Worklist() {
  const { profile } = useAuth()
  const queue = useFulfillmentQueue()
  const orders = useOrders()
  const people = useSalespeople()
  const invalidate = useInvalidate()
  const [params, setParams] = useSearchParams()
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState(null)
  const [sapDraft, setSapDraft] = useState({})
  const [msg, setMsg] = useState(null)

  const stage = params.get('stage') || 'all'
  const who = params.get('who') || 'mine'
  const setParam = (k, v) => {
    const n = new URLSearchParams(params)
    if (!v || v === 'all') n.delete(k); else n.set(k, v)
    setParams(n, { replace: true })
  }

  const myCode = profile?.salesperson?.code
  const canAssignAny = ['super_admin', 'business_owner'].includes(profile?.role) || profile?.salesperson?.is_supervisor

  const rows = useMemo(() => {
    if (!queue.data) return []
    return queue.data.filter(
      (o) =>
        (stage === 'all' || o.fulfillment_stage === stage) &&
        (who === 'all' ||
          (who === 'mine' && o.owner_code === myCode) ||
          (who === 'unassigned' && !o.owner_code))
    )
  }, [queue.data, stage, who, myCode])

  const counts = useMemo(() => {
    const c = {}
    for (const o of queue.data || []) {
      if (who === 'mine' && o.owner_code !== myCode) continue
      if (who === 'unassigned' && o.owner_code) continue
      c[o.fulfillment_stage] = (c[o.fulfillment_stage] || 0) + 1
    }
    return c
  }, [queue.data, who, myCode])

  const advance = async (orderId, to) => {
    setBusy(orderId); setMsg(null)
    const { error } = await supabase.from('orders').update({ fulfillment_stage: to }).eq('order_id', orderId)
    if (error) setMsg(error.message)
    else invalidate(['fulfillment_queue', 'orders'])
    setBusy('')
  }

  const saveSap = async (orderId) => {
    const v = (sapDraft[orderId] || '').trim()
    if (!v) return
    setBusy(orderId); setMsg(null)
    const { error } = await supabase.from('orders').update({ sap_order_no: v }).eq('order_id', orderId)
    if (error) setMsg(error.message)
    else { setSapDraft({ ...sapDraft, [orderId]: '' }); invalidate(['fulfillment_queue', 'orders']) }
    setBusy('')
  }

  const selfAssign = async (orderId) => {
    setBusy(orderId); setMsg(null)
    // upsert keyed on order_id: one assignment per order, no check-then-act race.
    const { error } = await supabase.from('order_assignment')
      .upsert({ order_id: orderId, sales_id: profile.sales_id }, { onConflict: 'order_id' })
    if (error) setMsg(error.message)
    else invalidate(['fulfillment_queue', 'orders'])
    setBusy('')
  }

  const reassign = async (orderId, salesId) => {
    setBusy(orderId); setMsg(null)
    // Empty selection means unassign: delete the row rather than writing an empty FK.
    const { error } = salesId
      ? await supabase.from('order_assignment')
          .upsert({ order_id: orderId, sales_id: salesId }, { onConflict: 'order_id' })
      : await supabase.from('order_assignment').delete().eq('order_id', orderId)
    if (error) setMsg(error.message)
    else invalidate(['fulfillment_queue', 'orders'])
    setBusy('')
  }

  if (queue.isLoading) return <Spinner label="Loading worklist" />
  if (queue.error) return <ErrorNote error={queue.error} />

  const stalled = rows.filter((r) => r.days_in_stage > 14).length
  const value = rows.reduce((n, r) => n + Number(r.total_amount || 0), 0)
  const orderFull = (id) => orders.data?.find((o) => o.order_id === id)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fulfillment</h1>
          <p>{rows.length} order{rows.length === 1 ? '' : 's'} · {php(value)} moving through the pipeline. Oldest first.</p>
        </div>
      </div>

      {stalled > 0 && (
        <div className="notice notice-info" style={{ marginBottom: 14 }}>
          {stalled} order{stalled === 1 ? '' : 's'} sat in the same stage for more than 14 days.
        </div>
      )}

      {msg && <div className="notice notice-error" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className="filters">
        {['mine', 'unassigned', 'all'].map((w) => (
          <button key={w} className={`btn btn-sm ${who === w ? '' : 'btn-ghost'}`} onClick={() => setParam('who', w)}>
            {w === 'mine' ? 'Mine' : w === 'unassigned' ? 'Unassigned' : 'Everyone'}
          </button>
        ))}
      </div>

      <div className="filters">
        <button className={`btn btn-sm ${stage === 'all' ? '' : 'btn-ghost'}`} onClick={() => setParam('stage', 'all')}>
          All stages ({Object.values(counts).reduce((a, b) => a + b, 0)})
        </button>
        {STAGES.map((s) => (
          <button key={s} className={`btn btn-sm ${stage === s ? '' : 'btn-ghost'}`} onClick={() => setParam('stage', s)}>
            {s} ({counts[s] || 0})
          </button>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Order</th><th>Customer</th><th>Stage</th><th className="right">Age</th>
              <th>Owner</th><th className="right">Value</th><th>Next step</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 250).map((o) => (
              <tr key={o.order_id} className={o.days_in_stage > 14 ? 'risk-amber' : ''}>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <button className="linkbtn" style={{ padding: 0 }} onClick={() => setOpen(orderFull(o.order_id))}>
                    {o.order_id}
                  </button>
                  <div className="fill-label">{shortDate(o.order_date)} · {o.lines} line{o.lines === 1 ? '' : 's'}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{o.company || o.contact || '—'}</div>
                  <div className="fill-label">{o.email}</div>
                </td>
                <td><span className="pill pill-webshop">{o.fulfillment_stage}</span></td>
                <td className="right">
                  {o.age_days}d
                  <div className="fill-label" style={{ color: o.days_in_stage > 14 ? 'var(--tr-amber)' : 'inherit' }}>
                    {o.days_in_stage}d here
                  </div>
                </td>
                <td>
                  {canAssignAny ? (
                    <select value={people.data?.find((p) => p.code === o.owner_code)?.sales_id || ''}
                      disabled={busy === o.order_id}
                      onChange={(e) => reassign(o.order_id, e.target.value)} style={{ minWidth: 120 }}>
                      <option value="">Unassigned</option>
                      {people.data?.map((p) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
                    </select>
                  ) : o.owner ? o.owner : (
                    <button className="btn btn-sm" disabled={busy === o.order_id} onClick={() => selfAssign(o.order_id)}>Pick up</button>
                  )}
                </td>
                <td className="right">{php(o.total_amount)}</td>
                <td>
                  {o.fulfillment_stage === 'Endorsed to Ops' || o.fulfillment_stage === 'For Order Creation' ? (
                    <div className="toolbar" style={{ gap: 4 }}>
                      <input placeholder="SAP no." value={sapDraft[o.order_id] || ''}
                        onChange={(e) => setSapDraft({ ...sapDraft, [o.order_id]: e.target.value })}
                        style={{ maxWidth: 110 }} />
                      <button className="btn btn-sm" disabled={busy === o.order_id} onClick={() => saveSap(o.order_id)}>Save</button>
                    </div>
                  ) : NEXT[o.fulfillment_stage] ? (
                    <button className="btn btn-ghost btn-sm" disabled={busy === o.order_id}
                      onClick={() => advance(o.order_id, NEXT[o.fulfillment_stage])}>
                      → {NEXT[o.fulfillment_stage]}
                    </button>
                  ) : (
                    <span className="fill-label">Awaiting collection</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">Nothing in this queue.</div>}
      </div>

      {open && <OrderDrawer order={open} onClose={() => setOpen(null)} />}
    </>
  )
}
