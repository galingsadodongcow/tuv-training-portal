'use client'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useFulfillmentQueue, useOrders, useSalespeople, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote, ChannelPill } from '../components/ui'
import { useToast } from '../components/Toast'
import { TableSkeleton } from '../components/Skeleton'
import OrderDrawer from '../components/OrderDrawer'
import { php, shortDate } from '../lib/format'

const STAGES = ['New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback']
const NEXT: Record<string, string> = {
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
  const qc = useQueryClient()
  const toast = useToast()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState('')
  const [open, setOpen] = useState<any>(null)
  const [sapDraft, setSapDraft] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)

  const stage = params.get('stage') || 'all'
  const who = params.get('who') || 'mine'
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params.toString())
    if (!v || v === 'all') n.delete(k)
    else n.set(k, v)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  const myCode = profile?.salesperson?.code
  const canAssignAny = ['super_admin', 'business_owner'].includes(profile?.role as string) || profile?.salesperson?.is_supervisor

  const rows = useMemo(() => {
    if (!queue.data) return []
    return queue.data.filter(
      (o: any) =>
        (stage === 'all' || o.fulfillment_stage === stage) &&
        (who === 'all' ||
          (who === 'mine' && o.owner_code === myCode) ||
          (who === 'unassigned' && !o.owner_code))
    )
  }, [queue.data, stage, who, myCode])

  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of queue.data || []) {
      if (who === 'mine' && o.owner_code !== myCode) continue
      if (who === 'unassigned' && o.owner_code) continue
      c[o.fulfillment_stage] = (c[o.fulfillment_stage] || 0) + 1
    }
    return c
  }, [queue.data, who, myCode])

  const advance = async (orderId: string, to: string) => {
    setBusy(orderId); setMsg(null)
    // Optimistic: reflect the new stage in the cached queue immediately, then
    // roll back if the write fails.
    const prev = qc.getQueryData<any[]>(['fulfillment_queue'])
    qc.setQueryData<any[]>(['fulfillment_queue'], (old) =>
      old?.map((o) => (o.order_id === orderId ? { ...o, fulfillment_stage: to, days_in_stage: 0 } : o))
    )
    const { error } = await supabase.from('orders').update({ fulfillment_stage: to }).eq('order_id', orderId)
    if (error) {
      qc.setQueryData(['fulfillment_queue'], prev)
      setMsg(error.message); toast.error(error.message)
    } else {
      invalidate(['fulfillment_queue', 'orders']); toast.success('Order advanced.')
    }
    setBusy('')
  }

  const saveSap = async (orderId: string) => {
    const v = (sapDraft[orderId] || '').trim()
    if (!v) return
    setBusy(orderId); setMsg(null)
    const { error } = await supabase.from('orders').update({ sap_order_no: v }).eq('order_id', orderId)
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { setSapDraft({ ...sapDraft, [orderId]: '' }); invalidate(['fulfillment_queue', 'orders']); toast.success('SAP number saved.') }
    setBusy('')
  }

  const selfAssign = async (orderId: string) => {
    setBusy(orderId); setMsg(null)
    // upsert keyed on order_id: one assignment per order, no check-then-act race.
    const { error } = await supabase.from('order_assignment')
      .upsert({ order_id: orderId, sales_id: profile?.sales_id }, { onConflict: 'order_id' })
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { invalidate(['fulfillment_queue', 'orders']); toast.success('Assignment updated.') }
    setBusy('')
  }

  const reassign = async (orderId: string, salesId: string) => {
    setBusy(orderId); setMsg(null)
    // Empty selection means unassign: delete the row rather than writing an empty FK.
    const { error } = salesId
      ? await supabase.from('order_assignment')
          .upsert({ order_id: orderId, sales_id: salesId }, { onConflict: 'order_id' })
      : await supabase.from('order_assignment').delete().eq('order_id', orderId)
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { invalidate(['fulfillment_queue', 'orders']); toast.success('Assignment updated.') }
    setBusy('')
  }

  if (queue.isLoading) return <TableSkeleton rows={8} cols={7} />
  if (queue.error) return <ErrorNote error={queue.error} />

  const stalled = rows.filter((r: any) => r.days_in_stage > 14).length
  const value = rows.reduce((n: number, r: any) => n + Number(r.total_amount || 0), 0)
  const orderFull = (id: string) => orders.data?.find((o: any) => o.order_id === id)

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
            {rows.slice(0, 250).map((o: any) => (
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
                    <select value={people.data?.find((p: any) => p.code === o.owner_code)?.sales_id || ''}
                      disabled={busy === o.order_id}
                      onChange={(e) => reassign(o.order_id, e.target.value)} style={{ minWidth: 120 }}>
                      <option value="">Unassigned</option>
                      {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
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
