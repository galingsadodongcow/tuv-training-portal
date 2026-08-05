'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useInvalidate, useTransferTargets } from '../hooks/data'
import { ChannelPill } from './ui'
import { php, shortDate } from '../lib/format'
import { formatSegments, lt } from '../lib/labels'

const STAGES = ['New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback', 'Cancelled']
const PAYMENTS = ['Unpaid', 'Partial', 'Paid']

function LineTransfer({ line, onDone, onCancel }: { line: any; onDone: () => void; onCancel: () => void }) {
  const targets = useTransferTargets(line.course_id, line.schedule_id)
  const invalidate = useInvalidate()
  const [target, setTarget] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const go = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('fn_transfer_line', {
      p_line: line.line_id, p_new_schedule: target, p_reason: 'Moved from the order screen',
    })
    if (error) { setErr(error.message); setBusy(false); return }
    invalidate(['orders', 'schedules', 'channel_pax', 'session_orders'])
    onDone()
  }

  return (
    <div style={{ padding: '8px 0' }}>
      <select value={target} onChange={(e) => setTarget(e.target.value)}>
        <option value="">Move this line to…</option>
        {targets.data?.map((t) => (
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

export default function OrderDrawer({ order, onClose }: { order: any; onClose: () => void }) {
  const { profile } = useAuth()
  const invalidate = useInvalidate()
  const [stage, setStage] = useState(order.fulfillment_stage)
  const [sap, setSap] = useState(order.sap_order_no || '')
  const [pay, setPay] = useState(order.payment_status)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [moving, setMoving] = useState(null)

  const canEdit = ['operations', 'super_admin', 'sales', 'business_owner'].includes(profile?.role)

  const save = async () => {
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('orders')
      .update({ fulfillment_stage: stage, sap_order_no: sap.trim() || null, payment_status: pay })
      .eq('order_id', order.order_id)
    if (error) setMsg({ ok: false, t: error.message })
    else {
      setMsg({ ok: true, t: 'Saved.' })
      invalidate(['orders', 'fulfillment_queue'])
    }
    setBusy(false)
  }

  const lines = order.lines || []

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{order.client?.company || order.client?.name || 'Order'}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {order.order_id} · {shortDate(order.order_date)} · {php(order.total_amount)}
            </div>
          </div>
          <button className="linkbtn" onClick={onClose}>Close</button>
        </div>

        <div className="drawer-body">
          <div className="chip-row" style={{ marginBottom: 16 }}>
            <ChannelPill value={order.channel} />
            <span className="pill pill-webshop">{order.fulfillment_stage}</span>
            <span className="fill-label">{order.client?.email}</span>
          </div>

          {canEdit && (
            <div className="drawer-section" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
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
              {msg && <div className={`notice ${msg.ok ? 'notice-info' : 'notice-error'}`} style={{ marginBottom: 10 }}>{msg.t}</div>}
              <button className="btn btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            </div>
          )}

          <div className="drawer-section">
            <div className="k-label" style={{ marginBottom: 8 }}>
              Training lines ({lines.length}) · {order.total_seats} seat{order.total_seats === 1 ? '' : 's'}
            </div>
            {lines.map((l) => (
              <div key={l.line_id} style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600 }}>{l.line_no}. {l.course?.course_name}</div>
                <div className="fill-label">
                  {l.schedule
                    ? formatSegments(l.schedule.date_segments, l.schedule.start_date, l.schedule.end_date)
                    : 'E-learning, no session'}
                  {' · '}{l.seats} seat{l.seats > 1 ? 's' : ''} · {php(l.amount_php)} · {l.line_status}
                </div>
                {canEdit && l.schedule_id && (
                  moving === l.line_id ? (
                    <LineTransfer line={l} onDone={() => { setMoving(null); onClose() }} onCancel={() => setMoving(null)} />
                  ) : (
                    <button className="linkbtn" style={{ padding: 0 }} onClick={() => setMoving(l.line_id)}>Move to another session</button>
                  )
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
