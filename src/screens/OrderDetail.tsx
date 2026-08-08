'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useOrder, useInvalidate, useTransferTargets, useEntityActivity, useAuditTrail } from '../hooks/data'
import ActivityTimeline from '../components/ActivityTimeline'
import { taskEvents, notificationEvents, auditEvents, mergeActivity } from '../lib/activity'
import { ChannelPill, Spinner, ErrorNote } from '../components/ui'
import { RecordHeader, RecordSection, KeyVal, RecordNotice, Badge } from '../components/record'
import BlockerBar from '../components/BlockerBar'
import { useToast } from '../components/Toast'
import { php, shortDate } from '../lib/format'
import { formatSegments, lt } from '../lib/labels'
import { collectionState, collectionTone } from '../lib/orderState'

const STAGES = ['New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback', 'Cancelled']
const PAYMENTS = ['Unpaid', 'Partial', 'Paid']

function LineTransfer({ line, onDone, onCancel }: { line: any; onDone: () => void; onCancel: () => void }) {
  const targets = useTransferTargets(line.course_id, line.schedule_id)
  const invalidate = useInvalidate()
  const toast = useToast()
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('fn_transfer_line', {
      p_line: line.line_id, p_new_schedule: target, p_reason: 'Moved from the order screen',
    })
    if (error) { setErr(error.message); toast.error(error.message); setBusy(false); return }
    invalidate(['order', 'orders', 'schedules', 'channel_pax', 'session_orders'])
    toast.success('Line transferred.')
    onDone()
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <select value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Move this line to…</option>
        {targets.data?.map((t: any) => (
          <option key={t.schedule_id} value={t.schedule_id}>
            {formatSegments(t.date_segments, t.start_date, t.end_date)} · {lt(t.modality)} · {t.booked_participants} booked
          </option>
        ))}
      </select>
      {err && <div className="notice notice-error" style={{ margin: '8px 0' }}>{err}</div>}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn btn-sm" disabled={!target || busy} onClick={go}>Transfer</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function OrderDetail() {
  const params = useParams()
  const id = String(params.id)
  const { profile } = useAuth()
  const invalidate = useInvalidate()
  const toast = useToast()
  const order = useOrder(id)
  const activity = useEntityActivity('order', id)
  const audit = useAuditTrail('orders', id)

  const [stage, setStage] = useState('')
  const [sap, setSap] = useState('')
  const [pay, setPay] = useState('')
  const [init, setInit] = useState(false)
  const [rev, setRev] = useState<string | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [moving, setMoving] = useState<string | null>(null)

  if (order.isLoading) return <Spinner label="Loading order" />
  if (order.error) return <ErrorNote error={order.error} />
  const o: any = order.data
  if (!o) {
    return (
      <>
        <RecordHeader title="Order not found" back={{ href: '/orders', label: 'Orders' }} />
        <div className="card"><div className="empty">This order does not exist or you cannot access it.</div></div>
      </>
    )
  }

  // Seed the editable fields and the concurrency token once the record arrives.
  if (!init) {
    setStage(o.fulfillment_stage)
    setSap(o.sap_order_no || '')
    setPay(o.payment_status)
    setRev(o.updated_at)
    setInit(true)
  }

  const reload = () => {
    setConflict(false); setMsg(null); setInit(false)
    invalidate(['order'])
  }

  const canEdit = ['operations', 'super_admin', 'sales', 'business_owner'].includes(profile?.role as string)
  const lines = o.lines || []
  const assignee = o.assignment?.[0]?.salesperson?.name
  const collection = collectionState(o)

  const save = async () => {
    setBusy(true); setMsg(null); setConflict(false)
    let q = supabase.from('orders')
      .update({ fulfillment_stage: stage, sap_order_no: sap.trim() || null, payment_status: pay })
      .eq('order_id', o.order_id)
    // Optimistic concurrency: only overwrite the row we actually read. If the
    // updated_at token is absent (migration not applied), fall back to a plain
    // update. maybeSingle returns null when nothing matched, i.e. a conflict.
    if (rev) q = q.eq('updated_at', rev)
    const { data, error } = await q.select('updated_at').maybeSingle()
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else if (rev && !data) {
      setConflict(true)
      setMsg({ ok: false, t: 'This order changed since you opened it. Reload to get the latest, then reapply your change.' })
      toast.error('Save blocked: the order changed.')
    } else {
      if (data?.updated_at) setRev(data.updated_at)
      setMsg({ ok: true, t: 'Saved.' }); invalidate(['order', 'orders', 'fulfillment_queue']); toast.success('Order updated.')
    }
    setBusy(false)
  }

  return (
    <>
      <RecordHeader
        back={{ href: '/orders', label: 'Orders' }}
        title={o.client?.company || o.client?.name || 'Order'}
        subtitle={`${o.order_id} · ${shortDate(o.order_date)} · ${php(o.total_amount)}`}
        badges={
          <>
            <ChannelPill value={o.channel} />
            <span className="pill pill-webshop">{o.fulfillment_stage}</span>
            <span className="pill pill-cancelled">{o.payment_status}</span>
            {collection !== 'None' && collection !== 'Not due' && <Badge tone={collectionTone(collection)}>{collection}</Badge>}
            {assignee && <span className="fill-label">{assignee}</span>}
            {o.client?.email && <span className="fill-label">{o.client.email}</span>}
          </>
        }
      />

      <BlockerBar order={o} />

      {canEdit && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="k-label" style={{ marginBottom: 8 }}>Fulfillment</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Stage</span>
              <select value={stage} onChange={(e) => setStage(e.target.value)}>
                {STAGES.map((s) => (<option key={s}>{s}</option>))}
              </select>
            </label>
            <label className="field"><span>Payment</span>
              <select value={pay} onChange={(e) => setPay(e.target.value)}>
                {PAYMENTS.map((p) => (<option key={p}>{p}</option>))}
              </select>
            </label>
          </div>
          <label className="field"><span>SAP order number</span>
            <input value={sap} onChange={(e) => setSap(e.target.value)} placeholder="176152681" />
          </label>
          <div className="fill-label" style={{ marginBottom: 10 }}>
            Entering a SAP number moves the order to SAP Created automatically.
          </div>
          {msg && (
            <div style={{ marginBottom: 10 }}>
              <RecordNotice ok={msg.ok}>
                {msg.t}
                {conflict && <> <button className="linkbtn" onClick={reload}>Reload</button></>}
              </RecordNotice>
            </div>
          )}
          <button className="btn btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      )}

      <div className="card card-pad">
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 4 }}>
          <KeyVal label="Customer">{o.client?.company || o.client?.name || '—'}</KeyVal>
          <KeyVal label="Seats">{o.total_seats}</KeyVal>
          <KeyVal label="Order status">{o.order_status || '—'}</KeyVal>
        </div>

        <RecordSection title={`Training lines (${lines.length})`}>
          {lines.length === 0 && <div className="muted fill-label">No lines on this order.</div>}
          {lines.map((l: any) => (
            <div key={l.line_id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600 }}>{l.line_no}. {l.course?.course_name}</div>
              <div className="fill-label">
                {l.schedule_id
                  ? <Link href={`/session/${l.schedule_id}`}>{l.schedule ? formatSegments(l.schedule.date_segments, l.schedule.start_date, l.schedule.end_date) : 'View session'}</Link>
                  : 'E-learning, no session'}
                {' · '}{l.seats} seat{l.seats > 1 ? 's' : ''} · {php(l.amount_php)} · {l.line_status}
              </div>
              {canEdit && l.schedule_id && (
                moving === l.line_id ? (
                  <LineTransfer line={l} onDone={() => setMoving(null)} onCancel={() => setMoving(null)} />
                ) : (
                  <button className="linkbtn" style={{ padding: 0 }} onClick={() => setMoving(l.line_id)}>Move to another session</button>
                )
              )}
            </div>
          ))}
        </RecordSection>

        <RecordSection title="Activity">
          <ActivityTimeline
            events={mergeActivity(
              taskEvents(activity.data?.tasks),
              notificationEvents(activity.data?.notifs),
              auditEvents(audit.data)
            )}
            loading={activity.isLoading}
          />
        </RecordSection>
      </div>
    </>
  )
}
