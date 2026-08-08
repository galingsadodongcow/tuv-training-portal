'use client'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useFulfillmentQueue, useSalespeople, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote, ChannelPill } from '../components/ui'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { TableSkeleton } from '../components/Skeleton'
import { php, shortDate } from '../lib/format'
import { primaryFlag, ORDER_VIEWS, orderView } from '../lib/orderState'

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
  const people = useSalespeople()
  const invalidate = useInvalidate()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  const stage = params.get('stage') || 'all'
  const who = params.get('who') || 'mine'
  const view = params.get('view') || 'all'
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params.toString())
    if (!v || v === 'all') n.delete(k)
    else n.set(k, v)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  const myCode = profile?.salesperson?.code
  const canAssignAny = ['super_admin', 'business_owner'].includes(profile?.role as string) || profile?.salesperson?.is_supervisor

  // Owner scope first: mine, unassigned, or everyone.
  const whoScoped = useMemo(() => {
    if (!queue.data) return []
    return queue.data.filter(
      (o: any) =>
        who === 'all' ||
        (who === 'mine' && o.owner_code === myCode) ||
        (who === 'unassigned' && !o.owner_code)
    )
  }, [queue.data, who, myCode])

  // Rows shown: the owner scope narrowed by the named view and the stage.
  const rows = useMemo(
    () => whoScoped.filter((o: any) => (stage === 'all' || o.fulfillment_stage === stage) && orderView(view).test(o)),
    [whoScoped, stage, view]
  )

  // How much work of each kind exists in the current owner scope.
  const viewCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const v of ORDER_VIEWS) c[v.key] = whoScoped.filter(v.test).length
    return c
  }, [whoScoped])

  const stageCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const o of whoScoped) c[o.fulfillment_stage] = (c[o.fulfillment_stage] || 0) + 1
    return c
  }, [whoScoped])

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
    // Reassignment is a destructive action: confirm and take a reason first.
    const who = salesId ? (people.data?.find((p: any) => p.sales_id === salesId)?.name || 'another owner') : 'no one'
    const res = await confirm({
      title: salesId ? 'Reassign this order?' : 'Unassign this order?',
      body: `Ownership changes to ${who}.`,
      confirmLabel: salesId ? 'Reassign' : 'Unassign',
      tone: salesId ? 'default' : 'danger',
      reason: 'optional',
    })
    if (!res.ok) return
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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fulfillment</h1>
          <p>
            {rows.length} order{rows.length === 1 ? '' : 's'} · {php(value)}
            {view !== 'all' ? ` · ${orderView(view).label.toLowerCase()}` : ''}
            {who === 'unassigned' ? ' · unassigned, ready to claim' : ''}. Oldest first.
          </p>
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
            {w === 'mine' ? 'Mine' : w === 'unassigned' ? 'Claim queue' : 'Everyone'}
          </button>
        ))}
        <select value={stage} onChange={(e) => setParam('stage', e.target.value)} style={{ marginLeft: 'auto' }}>
          <option value="all">All stages ({Object.values(stageCounts).reduce((a, b) => a + b, 0)})</option>
          {STAGES.map((s) => (<option key={s} value={s}>{s} ({stageCounts[s] || 0})</option>))}
        </select>
      </div>

      <div className="filters">
        {ORDER_VIEWS.map((v) => (
          <button key={v.key} className={`btn btn-sm ${view === v.key ? '' : 'btn-ghost'}`} onClick={() => setParam('view', v.key)}>
            {v.label} ({viewCounts[v.key] || 0})
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
                  <button className="linkbtn" style={{ padding: 0 }} onClick={() => router.push(`/orders/${o.order_id}`)}>
                    {o.order_id}
                  </button>
                  <div className="fill-label">{shortDate(o.order_date)} · {o.lines} line{o.lines === 1 ? '' : 's'}</div>
                </td>
                <td>
                  <div style={{ fontWeight: 600 }}>{o.company || o.contact || '—'}</div>
                  <div className="fill-label">{o.email}</div>
                </td>
                <td>
                  <span className="pill pill-webshop">{o.fulfillment_stage}</span>
                  {(() => {
                    const f = primaryFlag(o)
                    return f ? (
                      <div className="fill-label" style={{ marginTop: 4, color: f.tone === 'danger' ? 'var(--tr-red)' : f.tone === 'warn' ? 'var(--tr-amber)' : 'inherit' }}>
                        {f.label}
                      </div>
                    ) : null
                  })()}
                </td>
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
                  {NEXT[o.fulfillment_stage] ? (
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
        {rows.length === 0 && (
          <div className="empty">
            {who === 'unassigned' ? 'No unassigned orders. Everything has an owner.' : 'Nothing in this view.'}
          </div>
        )}
      </div>
    </>
  )
}
