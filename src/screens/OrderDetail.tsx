'use client'
import { useState, ReactNode } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useOrder, useInvalidate, useTransferTargets, useEntityActivity, useAuditTrail, useOrderNotes,
  useOrderCompleteness, useOrderHandoff, useEndorseOrder, useAcceptEndorsement, useReturnForCorrection } from '../hooks/data'
import ActivityTimeline from '../components/ActivityTimeline'
import { noteEvents, taskEvents, notificationEvents, auditEvents, mergeActivity } from '../lib/activity'
import { ChannelPill, Spinner, ErrorNote } from '../components/ui'
import { RecordHeader, RecordTabs, RecordSection, KeyVal, RecordNotice, Badge } from '../components/record'
import BlockerBar from '../components/BlockerBar'
import OwnerAssign from '../components/OwnerAssign'
import ReceivablePanel from '../components/ReceivablePanel'
import AttachmentsPanel from '../components/AttachmentsPanel'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { php, shortDate } from '../lib/format'
import { formatSegments, lt } from '../lib/labels'
import { collectionState, collectionTone, stageLabel } from '../lib/orderState'

const STAGES = ['New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback', 'Cancelled']

function LineTransfer({ line, onDone, onCancel }: { line: any; onDone: () => void; onCancel: () => void }) {
  const targets = useTransferTargets(line.course_id, line.schedule_id)
  const invalidate = useInvalidate()
  const toast = useToast()
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const go = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('fn_transfer_line', {
      p_line: line.line_id, p_new_schedule: target, p_reason: reason.trim() || 'Moved from the order screen',
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
      <input aria-label="Transfer reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)" style={{ marginTop: 8 }} />
      {err && <div className="notice notice-error" style={{ margin: '8px 0' }}>{err}</div>}
      <div className="toolbar" style={{ marginTop: 8 }}>
        <button className="btn btn-sm" disabled={!target || busy} onClick={go}>Move booking</button>
        <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  )
}

export default function OrderDetail() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const tab = search.get('tab') || 'overview'
  const setTab = (t: string) => {
    const n = new URLSearchParams(search.toString())
    if (t === 'overview') n.delete('tab')
    else n.set('tab', t)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const { profile } = useAuth()
  const invalidate = useInvalidate()
  const toast = useToast()
  const confirm = useConfirm()
  const order = useOrder(id)
  const activity = useEntityActivity('order', id)
  const audit = useAuditTrail('orders', id)
  const notes = useOrderNotes(id)
  const completeness = useOrderCompleteness(id)
  const handoff = useOrderHandoff(id)
  const endorse = useEndorseOrder()
  const accept = useAcceptEndorsement()
  const returnForCorrection = useReturnForCorrection()

  const [stage, setStage] = useState('')
  const [sap, setSap] = useState('')
  const [pay, setPay] = useState('')
  const [init, setInit] = useState(false)
  const [rev, setRev] = useState<string | undefined>(undefined)
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [posting, setPosting] = useState(false)

  const postComment = async () => {
    if (!comment.trim()) return
    setPosting(true)
    const { error } = await supabase.from('order_note').insert({ order_id: id, author: profile?.user_id, note: comment.trim() })
    if (error) toast.error(error.message)
    else { setComment(''); invalidate(['order_notes']); toast.success('Comment posted.') }
    setPosting(false)
  }

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
  // Comments are a write; the two read-only roles (management, auditor) may read the
  // thread but not post (RLS rejects the insert) — so hide the composer from them.
  const canComment = !['management', 'auditor'].includes(profile?.role as string)
  // Sales may not touch payment status or the SAP number — a DB trigger blocks
  // it, so the UI shows them read-only rather than as editable controls.
  const isSales = profile?.role === 'sales'
  const lines = o.lines || []
  const assignee = o.assignment?.[0]?.salesperson?.name
  const collection = collectionState(o)

  // Endorsement handoff (Sales/Coordinator -> Operations).
  const canEndorse = ['coordinator', 'sales', 'operations', 'super_admin'].includes(profile?.role as string)
  const canAccept = ['operations', 'super_admin'].includes(profile?.role as string)
  const canReturn = ['operations', 'coordinator', 'business_owner', 'super_admin'].includes(profile?.role as string)
  const comp: any = completeness.data
  const hstatus: string | undefined = handoff.data?.status

  const doEndorse = async () => {
    let overrideReason: string | undefined
    if (comp && comp.ok === false) {
      if (profile?.role !== 'super_admin') { toast.error('Order is not complete — resolve the blockers first.'); return }
      const res = await confirm({ title: 'Endorse despite blockers?', body: 'This order has open completeness blockers. As super admin you may override.', confirmLabel: 'Override and endorse', tone: 'danger', reason: 'required', reasonLabel: 'Override reason (required)' })
      if (!res.ok) return
      if (!res.reason?.trim()) { toast.error('An override reason is required.'); return }
      overrideReason = res.reason.trim()
    }
    try { await endorse.mutateAsync({ orderId: id, overrideReason }); toast.success('Endorsed to Operations.') }
    catch (e: any) { toast.error(e.message || 'Could not endorse this order.') }
  }
  const doAccept = async () => {
    try { await accept.mutateAsync(id); toast.success('Endorsement accepted.') }
    catch (e: any) { toast.error(e.message || 'Could not accept the endorsement.') }
  }
  const doReturn = async () => {
    const res = await confirm({ title: 'Return for correction?', body: 'This sends the order back to “Ready to create order”.', confirmLabel: 'Return', tone: 'danger', reason: 'required', reasonLabel: 'Reason (required)' })
    if (!res.ok) return
    if (!res.reason?.trim()) { toast.error('A reason is required to return an order.'); return }
    try { await returnForCorrection.mutateAsync({ orderId: id, reason: res.reason.trim() }); toast.success('Returned for correction.') }
    catch (e: any) { toast.error(e.message || 'Could not return this order.') }
  }

  const save = async () => {
    setBusy(true); setMsg(null); setConflict(false)
    let q = supabase.from('orders')
      .update({ fulfillment_stage: stage, sap_order_no: sap.trim() || null })
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

  // The overview is one card with record-section dividers (the SessionDetail
  // model, third-pass #21) instead of three stacked cards. The first visible
  // section sits flush at the card top; the rest get a divider above them. Which
  // section is first depends on the role's gates.
  const firstOverview = canEdit ? 'fulfillment' : (canEndorse || canAccept || canReturn) ? 'endorsement' : 'details'
  const ovSection = (id: string, title: string, body: ReactNode) =>
    id === firstOverview
      ? <div><div className="k-label" style={{ marginBottom: 8 }}>{title}</div>{body}</div>
      : <RecordSection title={title}>{body}</RecordSection>

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'lines', label: `Lines (${lines.length})` },
    { key: 'payments', label: 'Payments' },
    { key: 'files', label: 'Files' },
    { key: 'comments', label: `Comments (${notes.data?.length || 0})` },
    { key: 'activity', label: 'Activity' },
  ]

  return (
    <>
      <RecordHeader
        crumbs={[{ href: '/my-work', label: 'My Work' }, { href: '/orders', label: 'Orders' }, { label: o.order_id }]}
        title={o.client?.company || o.client?.name || 'Order'}
        subtitle={`${o.order_id} · ${shortDate(o.order_date)} · ${php(o.total_amount)}`}
        badges={
          <>
            <ChannelPill value={o.channel} />
            <span className="pill pill-webshop">{stageLabel(o.fulfillment_stage)}</span>
            <span className="pill pill-cancelled">{o.payment_status}</span>
            {collection !== 'None' && collection !== 'Not due' && <Badge tone={collectionTone(collection)}>{collection}</Badge>}
            {/* Ownership is editable here, not just displayed: an unowned order
                used to read "no owner assigned" with no way to fix it without
                going back to the queue. */}
            <OwnerAssign orderId={o.order_id} ownerSalesId={o.assignment?.[0]?.sales_id} ownerName={assignee} />
            {o.client?.email && <span className="fill-label">{o.client.email}</span>}
          </>
        }
      />

      <BlockerBar order={o} />

      <RecordTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="card card-pad">
          {canEdit && ovSection('fulfillment', 'Fulfillment', (
            <>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="field"><span>Stage</span>
                  <select value={stage} onChange={(e) => setStage(e.target.value)}>
                    {STAGES.map((s) => (<option key={s} value={s}>{stageLabel(s)}</option>))}
                  </select>
                </label>
                <label className="field"><span>Payment</span>
                  {/* Payment status is derived from the AR ledger and locked by a DB
                      trigger (#127) — it can't be set by hand. Record a payment on
                      the Payments tab to change it. Read-only for every role. */}
                  <input value={pay} readOnly disabled aria-label="Payment status (set automatically from recorded payments)" />
                  <span className="fill-label">Set automatically from recorded payments (Payments tab).</span>
                </label>
              </div>
              <label className="field"><span>SAP reference{isSales ? '' : ' (optional)'}</span>
                {isSales ? (
                  <input value={sap || '—'} readOnly disabled aria-label="SAP order number (read-only)" />
                ) : (
                  <input value={sap} onChange={(e) => setSap(e.target.value)} placeholder="176152681" />
                )}
              </label>
              <div className="fill-label" style={{ marginBottom: 10 }}>
                A note for reference only. It does not change the order's stage.
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
            </>
          ))}

          {(canEndorse || canAccept || canReturn) && ovSection('endorsement', 'Endorsement', (
            <>
              {hstatus && (
                <div className="fill-label" style={{ marginBottom: 8 }}>
                  Status: <Badge tone={hstatus === 'Accepted' ? 'ok' : hstatus === 'Returned' ? 'danger' : 'info'}>{hstatus}</Badge>
                  {' · '}
                  {/* Make the ownership transfer explicit rather than implied by the
                      stage — and tell the reader whose court the order is in now (#121). */}
                  <strong style={{ color: 'var(--text)' }}>
                    {hstatus === 'Endorsed' ? 'Now with Operations · awaiting acceptance'
                      : hstatus === 'Accepted' ? 'Accepted by Operations'
                      : hstatus === 'Returned' ? 'Returned to the coordinator'
                      : hstatus}
                  </strong>
                  {hstatus === 'Returned' && handoff.data?.return_reason ? ` · ${handoff.data.return_reason}` : ''}
                </div>
              )}
              {comp && (
                <div style={{ marginBottom: 10 }}>
                  {(comp.hard?.length || 0) === 0
                    ? <div className="fill-label" style={{ color: 'var(--success, var(--accent))' }}>All completeness checks pass.</div>
                    : (
                      <>
                        <div className="k-label" style={{ marginBottom: 4 }}>Blockers</div>
                        <ul className="fill-label" style={{ margin: 0, paddingLeft: 18, color: 'var(--warning)' }}>{comp.hard.map((h: string, i: number) => <li key={i}>{h}</li>)}</ul>
                      </>
                    )}
                  {(comp.warn?.length || 0) > 0 && (
                    <ul className="fill-label" style={{ margin: '6px 0 0', paddingLeft: 18 }}>{comp.warn.map((w: string, i: number) => <li key={i}>{w}</li>)}</ul>
                  )}
                </div>
              )}
              <div className="toolbar" style={{ gap: 6 }}>
                {canEndorse && <button className="btn btn-sm" onClick={doEndorse} disabled={endorse.isPending}>{endorse.isPending ? 'Endorsing…' : 'Endorse to Operations'}</button>}
                {canAccept && hstatus === 'Endorsed' && <button className="btn btn-sm" onClick={doAccept} disabled={accept.isPending}>{accept.isPending ? 'Accepting…' : 'Accept'}</button>}
                {canReturn && <button className="btn btn-ghost btn-sm" onClick={doReturn} disabled={returnForCorrection.isPending}>Return for correction</button>}
              </div>
            </>
          ))}

          {ovSection('details', 'Details', (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
              <KeyVal label="Customer">{o.client?.company || o.client?.name || '—'}</KeyVal>
              <KeyVal label="Seats">{o.total_seats}</KeyVal>
              <KeyVal label="Order status">{o.order_status || '—'}</KeyVal>
            </div>
          ))}
        </div>
      )}

      {tab === 'lines' && (
        <div className="card card-pad">
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
        </div>
      )}

      {tab === 'payments' && (
        <div className="card card-pad">
          <RecordSection title="Accounts receivable">
            <ReceivablePanel orderId={id} totalAmount={Number(o.total_amount || 0)} />
          </RecordSection>
        </div>
      )}

      {tab === 'files' && (
        <div className="card card-pad">
          <RecordSection title="Files">
            <AttachmentsPanel entityType="order" entityId={id} />
          </RecordSection>
        </div>
      )}

      {tab === 'comments' && (
        <div className="card card-pad">
          <RecordSection title={`Comments (${notes.data?.length || 0})`}>
            {canComment && (
              <div className="toolbar" style={{ marginBottom: 10 }}>
                <input aria-label="Add a comment" placeholder="Add a comment…" value={comment} onChange={(e) => setComment(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && postComment()} />
                <button className="btn btn-sm" onClick={postComment} disabled={posting}>{posting ? 'Posting…' : 'Post'}</button>
              </div>
            )}
            {notes.isLoading ? <Spinner /> : (notes.data?.length || 0) === 0 ? (
              <div className="muted fill-label">No comments yet. Start the thread.</div>
            ) : (
              <div className="notes">
                {notes.data?.map((n: any) => (
                  <div key={n.note_id} className="note">
                    <div className="note-meta">
                      <strong>{n.profile?.full_name || 'User'}</strong>
                      <span className="muted"> · {n.profile?.role}{n.date ? ` · ${new Date(n.date).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                    </div>
                    <div>{n.note}</div>
                  </div>
                ))}
              </div>
            )}
          </RecordSection>
        </div>
      )}

      {tab === 'activity' && (
        <div className="card card-pad">
          <RecordSection title="Activity">
            <ActivityTimeline
              events={mergeActivity(
                noteEvents(notes.data),
                taskEvents(activity.data?.tasks),
                notificationEvents(activity.data?.notifs),
                auditEvents(audit.data)
              )}
              loading={activity.isLoading}
            />
          </RecordSection>
        </div>
      )}
    </>
  )
}
