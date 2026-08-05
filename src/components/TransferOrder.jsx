import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTransferTargets, useInvalidate } from '../hooks/data'
import { Spinner } from './ui'
import { formatSegments, lt } from '../lib/labels'

export default function TransferOrder({ order, courseId, fromScheduleId, onClose }) {
  // `order` is an order_line row
  const targets = useTransferTargets(courseId, fromScheduleId)
  const invalidate = useInvalidate()
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const go = async () => {
    if (!target) return
    setBusy(true); setMsg(null)
    const { error } = await supabase.rpc('fn_transfer_line', {
      p_line: order.line_id,
      p_new_schedule: target,
      p_reason: reason || null,
    })
    if (error) { setMsg(error.message); setBusy(false); return }
    invalidate(['schedules', 'channel_pax', 'orders', 'session_orders', 'roster', 'notes'])
    onClose(true)
  }

  const seatsLeft = (t) => (t.max_participants == null ? null : t.max_participants - t.booked_participants)

  return (
    <div className="drawer-scrim" onClick={() => onClose(false)} style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div className="card card-pad" style={{ width: 520, maxWidth: '94vw' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Transfer booking</h3>
        <p className="muted" style={{ fontSize: 14 }}>
          Order {order.order?.order_id || order.order_id} · {order.seats} seat{order.seats > 1 ? 's' : ''} · {order.order?.client?.company || order.company || ''}
        </p>

        {targets.isLoading ? <Spinner /> : (
          <>
            <label className="field"><span>Move to session</span>
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Select a session…</option>
                {targets.data?.map((t) => {
                  const left = seatsLeft(t)
                  const full = left != null && left < order.seats
                  return (
                    <option key={t.schedule_id} value={t.schedule_id} disabled={full}>
                      {formatSegments(t.date_segments, t.start_date, t.end_date)} · {lt(t.modality)} · {t.booked_participants} booked
                      {left != null ? ` · ${left} seat${left === 1 ? '' : 's'} left` : ''}{full ? ' — full' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            {targets.data?.length === 0 && (
              <div className="notice notice-info">No other open session exists for this course. Create one first.</div>
            )}
            <label className="field"><span>Reason (goes on both session notes)</span>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer requested later date" />
            </label>
          </>
        )}

        {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}
        <div className="toolbar">
          <button className="btn" disabled={!target || busy} onClick={go}>{busy ? 'Transferring…' : 'Transfer'}</button>
          <button className="btn btn-ghost" onClick={() => onClose(false)}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
