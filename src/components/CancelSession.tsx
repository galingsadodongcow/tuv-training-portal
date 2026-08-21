'use client'

import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useCancelReadiness, useApprovedCancellation, useTransferTargets, useInvalidate } from '../hooks/data'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { Spinner } from './ui'
import { php } from '../lib/format'
import { formatSegments, lt } from '../lib/labels'

const ACTIONS = ['Transfer', 'Refund', 'Credit', 'No Action']

export default function CancelSession({ schedule, onDone, onClose }: { schedule: any; onDone: () => void; onClose: () => void }) {
  const { profile } = useAuth()
  const ready = useCancelReadiness(schedule.schedule_id)
  const approved = useApprovedCancellation(schedule.schedule_id)
  const targets = useTransferTargets(schedule.course_id, schedule.schedule_id)
  const invalidate = useInvalidate()
  const [draft, setDraft] = useState({})
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [result, setResult] = useState(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  // Focus-in + Tab focus-trap + restore on close (#135).
  useFocusTrap(dialogRef)

  const rows = ready.data || []
  const hasApproval = (approved.data?.length || 0) > 0

  const setAction = (orderId, patch) =>
    setDraft((d) => ({ ...d, [orderId]: { ...(d[orderId] || {}), ...patch } }))

  const saveDispositions = async () => {
    setBusy(true); setMsg(null)
    const payload = rows
      .filter((r) => draft[r.order_id]?.action)
      .map((r) => ({
        order_id: r.order_id,
        schedule_id: schedule.schedule_id,
        action: draft[r.order_id].action,
        target_schedule_id: draft[r.order_id].action === 'Transfer' ? draft[r.order_id].target || null : null,
        note: draft[r.order_id].note || null,
        decided_by: profile.user_id,
      }))
    const bad = payload.find((p) => p.action === 'Transfer' && !p.target_schedule_id)
    if (bad) { setMsg(`Pick a target session for ${bad.order_id}.`); setBusy(false); return }
    const { error } = await supabase.from('order_disposition').insert(payload)
    if (error) setMsg(error.message)
    else { invalidate(['cancel_readiness']); setDraft({}) }
    setBusy(false)
  }

  const runCancel = async () => {
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('fn_cancel_schedule', {
      p_schedule: schedule.schedule_id,
      p_reason: reason || null,
    })
    if (error) { setMsg(error.message); setBusy(false); return }
    setResult(data || [])
    invalidate(['schedules', 'channel_pax', 'orders', 'session_orders', 'notes', 'approvals'])
    setBusy(false)
  }

  const pending = rows.filter((r) => !r.action).length

  return (
    <div className="drawer-scrim" onClick={() => onClose()} style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="card card-pad" style={{ width: 640, maxWidth: '95vw', maxHeight: '88vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}
        ref={dialogRef} role="dialog" aria-modal="true" aria-label="Cancel session"
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
        <h3 style={{ marginTop: 0 }}>Cancel session</h3>

        {result ? (
          <>
            <div className="notice notice-info">Session cancelled. {result.length} booking(s) handled.</div>
            <table>
              <thead><tr><th>Order</th><th>Company</th><th>Seats</th><th>Action</th></tr></thead>
              <tbody>
                {result.map((r) => (
                  <tr key={r.out_order_id}>
                    <td>{r.out_order_id}</td><td>{r.out_company || '—'}</td>
                    <td>{r.out_seats}</td><td>{r.out_action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => { onDone(); onClose() }}>Done</button>
          </>
        ) : (
          <>
            {!hasApproval && (
              <div className="notice notice-error" style={{ marginBottom: 12 }}>
                No approved cancellation yet. Propose it on the Overview tab, then the business owner approves on the Approvals screen.
              </div>
            )}

            <p className="muted" style={{ fontSize: 14 }}>
              Every live booking needs a disposition before the session closes. Nothing is cancelled until then.
            </p>

            {!ready.isLoading && rows.length > 0 && (
              <div className={`notice ${pending > 0 ? 'notice-warn' : 'notice-info'}`} style={{ marginBottom: 12 }}>
                {pending > 0
                  ? `${pending} of ${rows.length} booking${rows.length > 1 ? 's' : ''} still need a disposition before this session can be cancelled.`
                  : `All ${rows.length} booking${rows.length > 1 ? 's' : ''} have a disposition — ready to cancel.`}
              </div>
            )}

            {ready.isLoading ? <Spinner /> : rows.length === 0 ? (
              <div className="notice notice-info">No live bookings. This session cancels cleanly.</div>
            ) : (
              <table style={{ marginBottom: 12 }}>
                <thead><tr><th>Booking</th><th>Disposition</th></tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.order_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.company || r.order_id}</div>
                        <div className="fill-label">{r.order_id} · {r.seats} seat{r.seats > 1 ? 's' : ''} · {php(r.amount_php)} · {r.payment_status}</div>
                      </td>
                      <td>
                        {r.action ? (
                          <span className="pill pill-webshop">{r.action}</span>
                        ) : (
                          <>
                            <select value={draft[r.order_id]?.action || ''} onChange={(e) => setAction(r.order_id, { action: e.target.value })}
                              aria-label={`Disposition for booking ${r.company || r.order_id}`}>
                              <option value="">Choose…</option>
                              {ACTIONS.map((a) => (<option key={a}>{a}</option>))}
                            </select>
                            {draft[r.order_id]?.action === 'Transfer' && (
                              <select style={{ marginTop: 6 }} value={draft[r.order_id]?.target || ''}
                                onChange={(e) => setAction(r.order_id, { target: e.target.value })}
                                aria-label={`Transfer target session for booking ${r.company || r.order_id}`}>
                                <option value="">Move to…</option>
                                {targets.data?.map((t) => (
                                  <option key={t.schedule_id} value={t.schedule_id}>
                                    {formatSegments(t.date_segments, t.start_date, t.end_date)} · {lt(t.modality)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

            <div className="toolbar" style={{ marginBottom: 12 }}>
              {pending > 0 && (
                <button className="btn btn-sm" disabled={busy} onClick={saveDispositions}>
                  {busy ? 'Saving…' : 'Save dispositions'}
                </button>
              )}
              <span className="fill-label">{pending} of {rows.length} still undecided</span>
            </div>

            <label className="field"><span>Reason (goes on the session note)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Low enrolment" />
            </label>

            <div className="toolbar">
              <button className="btn btn-danger" disabled={busy || pending > 0 || !hasApproval} onClick={runCancel}>
                Cancel session
              </button>
              <button className="btn btn-ghost" onClick={() => onClose()}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
