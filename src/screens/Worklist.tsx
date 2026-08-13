'use client'
import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useFulfillmentQueue, useSalespeople, useInvalidate, useSlaBreaches } from '../hooks/data'
import { ErrorNote } from '../components/ui'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { TableSkeleton } from '../components/Skeleton'
import SavedViews from '../components/SavedViews'
import { php, shortDate } from '../lib/format'
import { primaryFlag, ORDER_VIEWS, orderView, stageLabel } from '../lib/orderState'
import { updateUrlParams } from '../lib/urlParams'

const STAGES = ['New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback']
const NEXT: Record<string, string> = {
  'New': 'In Communication',
  'In Communication': 'For Order Creation',
  'For Order Creation': 'Endorsed to Ops',
  'Endorsed to Ops': 'SAP Created',
  'No Feedback': 'In Communication',
}

// The fulfillment queue (advance / assign / bulk controls). Rendered as the
// "Needs fulfillment" saved view of the CRM Orders tab (`embedded`), where the
// shell owns the heading; reachable via /worklist (redirects in). Reads its own
// who/view/stage params, which coexist with the shell's tab/queue.
export default function Worklist({ embedded }: { embedded?: boolean } = {}) {
  const { profile } = useAuth()
  const queue = useFulfillmentQueue()
  const people = useSalespeople()
  const sla = useSlaBreaches()
  const invalidate = useInvalidate()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkTo, setBulkTo] = useState('')

  const stage = params.get('stage') || 'all'
  // Salespeople land on their own queue; operations and other non-selling roles
  // land on everyone, since they do not own orders.
  // Default a selling rep to their own queue, but supervisors (and non-sellers)
  // default to the whole team's queue — a supervisor's job is the team view.
  const who = params.get('who')
    || ((profile?.salesperson?.code && !profile?.salesperson?.is_supervisor) ? 'mine' : 'all')
  const view = params.get('view') || 'all'
  const setParams = (updates: Record<string, string>) => {
    const n = updateUrlParams(params, updates)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const setParam = (k: string, v: string) => setParams({ [k]: v })

  const myCode = profile?.salesperson?.code
  const canAssignAny = ['super_admin', 'operations', 'business_owner'].includes(profile?.role as string) || profile?.salesperson?.is_supervisor
  // Fulfillment is a write action; management + auditor are read-only (RLS rejects
  // their stage writes) so the advance/select controls are hidden from them.
  const canAct = !['management', 'auditor'].includes(profile?.role as string)

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

  // ---- bulk selection over the visible rows ----
  const shown = rows.slice(0, 250)
  const visibleIds = shown.map((o: any) => o.order_id)
  const selectedVisible = visibleIds.filter((id: string) => selected.has(id))
  const allSelected = visibleIds.length > 0 && selectedVisible.length === visibleIds.length
  const toggle = (id: string) => setSelected((s) => {
    const n = new Set(s)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    return n
  })
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s)
    if (allSelected) visibleIds.forEach((id: string) => n.delete(id))
    else visibleIds.forEach((id: string) => n.add(id))
    return n
  })
  const clearSel = () => setSelected(new Set())

  const bulkAdvance = async () => {
    const ids = selectedVisible
    const targets = shown.filter((o: any) => ids.includes(o.order_id) && NEXT[o.fulfillment_stage])
    if (targets.length === 0) { toast.error('None of the selected orders have a next stage.'); return }
    setBusy('bulk'); setMsg(null)
    const byTo: Record<string, string[]> = {}
    for (const o of targets) { const to = NEXT[o.fulfillment_stage]; (byTo[to] ||= []).push(o.order_id) }
    let ok = 0; let failed = 0
    for (const [to, oids] of Object.entries(byTo)) {
      const { error } = await supabase.from('orders').update({ fulfillment_stage: to }).in('order_id', oids)
      if (error) { failed += oids.length; setMsg(error.message) } else ok += oids.length
    }
    invalidate(['fulfillment_queue', 'orders'])
    const skipped = ids.length - targets.length
    if (failed) toast.error(`${ok} advanced, ${failed} failed.`)
    else toast.success(`${ok} order${ok === 1 ? '' : 's'} advanced${skipped ? `, ${skipped} had no next stage` : ''}.`)
    clearSel(); setBusy('')
  }

  const bulkAssign = async (salesId: string) => {
    const ids = selectedVisible
    if (ids.length === 0) return
    const name = salesId ? (people.data?.find((p: any) => p.sales_id === salesId)?.name || 'another owner') : 'no one'
    const res = await confirm({
      title: salesId ? `Assign ${ids.length} order${ids.length === 1 ? '' : 's'}?` : `Unassign ${ids.length} order${ids.length === 1 ? '' : 's'}?`,
      body: `Ownership changes to ${name}.`,
      confirmLabel: salesId ? 'Assign' : 'Unassign',
      tone: salesId ? 'default' : 'danger',
      reason: 'optional',
    })
    if (!res.ok) return
    setBusy('bulk'); setMsg(null)
    const { error } = salesId
      ? await supabase.from('order_assignment').upsert(ids.map((order_id: string) => ({ order_id, sales_id: salesId })), { onConflict: 'order_id' })
      : await supabase.from('order_assignment').delete().in('order_id', ids)
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { invalidate(['fulfillment_queue', 'orders']); toast.success('Assignment updated.') }
    setBulkTo(''); clearSel(); setBusy('')
  }

  if (queue.isLoading) return <TableSkeleton rows={8} cols={7} />
  if (queue.error) return <ErrorNote error={queue.error} />

  const stalled = rows.filter((r: any) => r.days_in_stage > 14).length
  const value = rows.reduce((n: number, r: any) => n + Number(r.total_amount || 0), 0)

  return (
    <>
      {!embedded && (
        <div className="page-head">
          <div>
            <h1>Fulfillment</h1>
            <p>
              {rows.length} order{rows.length === 1 ? '' : 's'} · {php(value)}
              {view !== 'all' ? ` · ${orderView(view).label.toLowerCase()}` : ''}
              {who === 'unassigned' ? ' · unassigned, ready to claim' : ''}. Oldest first.
            </p>
            <span className="k-sub">All amounts in PHP (₱)</span>
          </div>
        </div>
      )}

      {stalled > 0 && (
        <div className="notice notice-info" style={{ marginBottom: 14 }}>
          {stalled} order{stalled === 1 ? '' : 's'} sat in the same stage for more than 14 days.
        </div>
      )}

      {(sla.data?.length || 0) > 0 && (
        <div className="notice notice-warn" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong>{sla.data.length} order{sla.data.length === 1 ? '' : 's'} past the stage SLA.</strong>
          {['operations', 'super_admin'].includes(profile?.role as string) && (
            <button className="btn btn-sm" onClick={async () => {
              const { data, error } = await supabase.rpc('fn_notify_sla_breaches')
              if (error) toast.error(error.message); else toast.success(`${data || 0} owner${data === 1 ? '' : 's'} notified.`)
            }}>Notify owners</button>
          )}
        </div>
      )}

      {msg && <div className="notice notice-error" style={{ marginBottom: 14 }}>{msg}</div>}

      <div className="filters">
        {['mine', 'unassigned', 'all'].map((w) => (
          <button key={w} className={`btn btn-sm ${who === w ? '' : 'btn-ghost'}`} onClick={() => setParam('who', w)}>
            {w === 'mine' ? 'Mine' : w === 'unassigned' ? 'Claim queue' : 'Everyone'}
          </button>
        ))}
        <select aria-label="Filter by stage" value={stage} onChange={(e) => setParam('stage', e.target.value)} style={{ marginLeft: 'auto' }}>
          <option value="all">All stages ({Object.values(stageCounts).reduce((a, b) => a + b, 0)})</option>
          {STAGES.map((s) => (<option key={s} value={s}>{stageLabel(s)} ({stageCounts[s] || 0})</option>))}
        </select>
      </div>

      <div className="filters">
        {ORDER_VIEWS.map((v) => (
          <button key={v.key} className={`btn btn-sm ${view === v.key ? '' : 'btn-ghost'}`} onClick={() => setParam('view', v.key)}>
            {v.label} ({viewCounts[v.key] || 0})
          </button>
        ))}
      </div>

      <div className="filters" style={{ marginTop: -6 }}>
        <SavedViews surface="worklist" paramKeys={['who', 'view', 'stage']} />
      </div>

      {selectedVisible.length > 0 && (
        <div className="notice notice-info" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <strong>{selectedVisible.length} selected</strong>
          {canAct && <button className="btn btn-sm" disabled={busy === 'bulk'} onClick={bulkAdvance}>Advance to next stage</button>}
          {canAssignAny && (
            <select aria-label="Assign selected orders to" value={bulkTo} disabled={busy === 'bulk'} onChange={(e) => bulkAssign(e.target.value)}>
              <option value="">Assign to…</option>
              {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
            </select>
          )}
          {!canAssignAny && profile?.sales_id && (
            <button className="btn btn-sm" disabled={busy === 'bulk'} onClick={() => bulkAssign(profile.sales_id as string)}>Claim</button>
          )}
          <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={clearSel}>Clear</button>
        </div>
      )}

      <div className="card">
        <table className="sticky-1">
          <thead>
            <tr>
              <th style={{ width: 32 }}>{canAct && <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />}</th>
              <th>Order</th><th>Customer</th><th>Stage</th><th className="right">Age</th>
              <th>Owner</th><th className="right">Value</th><th>Next step</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o: any) => (
              <tr key={o.order_id} className={o.days_in_stage > 14 ? 'risk-amber' : ''}>
                <td>{canAct && <input type="checkbox" checked={selected.has(o.order_id)} onChange={() => toggle(o.order_id)} aria-label={`Select ${o.order_id}`} />}</td>
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
                  <span className="pill pill-webshop">{stageLabel(o.fulfillment_stage)}</span>
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
                    <select aria-label={`Owner for order ${o.order_id}`}
                      value={people.data?.find((p: any) => p.code === o.owner_code)?.sales_id || ''}
                      disabled={busy === o.order_id}
                      onChange={(e) => reassign(o.order_id, e.target.value)} style={{ minWidth: 120 }}>
                      <option value="">Unassigned</option>
                      {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
                    </select>
                  ) : o.owner ? o.owner : profile?.sales_id ? (
                    <button className="btn btn-sm" disabled={busy === o.order_id} onClick={() => selfAssign(o.order_id)}>Pick up</button>
                  ) : (
                    <span className="fill-label">Unassigned</span>
                  )}
                </td>
                <td className="right">{php(o.total_amount)}</td>
                <td>
                  {NEXT[o.fulfillment_stage] ? (
                    canAct ? (
                      <button className="btn btn-ghost btn-sm" disabled={busy === o.order_id}
                        onClick={() => advance(o.order_id, NEXT[o.fulfillment_stage])}>
                        → {stageLabel(NEXT[o.fulfillment_stage])}
                      </button>
                    ) : (
                      <span className="fill-label">→ {stageLabel(NEXT[o.fulfillment_stage])}</span>
                    )
                  ) : (
                    <span className="fill-label">Awaiting collection</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 ? (
          <div className="empty">
            {view !== 'all' || stage !== 'all' ? (
              <>Nothing matches the current filters{whoScoped.length > 0 ? ` — ${whoScoped.length} hidden` : ''}.{' '}
                <button className="linkbtn" onClick={() => setParams({ view: 'all', stage: 'all' })}>Clear filters</button></>
            ) : who === 'unassigned' ? 'No unassigned orders. Everything has an owner.' : 'Nothing in this view.'}
          </div>
        ) : (whoScoped.length - rows.length > 0 && (view !== 'all' || stage !== 'all')) ? (
          <div className="fill-label" style={{ padding: '10px 12px' }}>
            {whoScoped.length - rows.length} hidden by the current filters —{' '}
            <button className="linkbtn" onClick={() => setParams({ view: 'all', stage: 'all' })}>Clear filters</button>
          </div>
        ) : null}
      </div>
    </>
  )
}
