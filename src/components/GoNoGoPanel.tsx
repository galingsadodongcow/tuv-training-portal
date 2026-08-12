'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSessionOrders, useScheduleApprovals, useInvalidate } from '../hooks/data'
import { Badge, KeyVal, RecordSection, RecordNotice } from './record'
import { Spinner, ErrorNote } from './ui'
import { useToast } from './Toast'
import { php, shortDate, daysUntil } from '../lib/format'

// Operations decides how many days before the start the go/no-go call is due.
const DECISION_LEAD_DAYS = 14

const canOps = (r?: string) => ['operations', 'super_admin'].includes(r || '')

// The system advises. Operations decides. This panel derives the recommendation
// and the health signals from data the session already carries, then routes the
// decision through the schedule status and the approval queue. No hidden state:
// go_status itself is auto-derived in the database as booked >= minimum.
export default function GoNoGoPanel({ schedule }: { schedule: any }) {
  const { profile } = useAuth()
  const toast = useToast()
  const invalidate = useInvalidate()
  const orders = useSessionOrders(schedule.schedule_id)
  const approvals = useScheduleApprovals(schedule.schedule_id)

  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [armGo, setArmGo] = useState(false)

  const booked = schedule.booked_participants ?? 0
  const min = schedule.min_participants ?? 0
  const max = schedule.max_participants ?? null
  const price = schedule.price ?? 0
  const targetPax = schedule.forecast_participants ?? min
  const targetRevenue = schedule.forecast_revenue ?? price * targetPax
  const minViableRevenue = price * min

  // Paid pax and revenue come from the booked lines on this session.
  const lines = (orders.data || []).filter((l: any) => l.line_status !== 'Cancelled')
  const paidLines = lines.filter((l: any) => l.order?.payment_status === 'Paid')
  const paidPax = paidLines.reduce((n: number, l: any) => n + (l.seats || 0), 0)
  const bookedRevenue = lines.reduce((n: number, l: any) => n + Number(l.amount_php || 0), 0)
  const targetGap = bookedRevenue - targetRevenue

  const decisionDeadline = schedule.start_date
    ? new Date(+new Date(schedule.start_date) - DECISION_LEAD_DAYS * 86400000).toISOString().slice(0, 10)
    : null
  const daysToDecision = decisionDeadline ? daysUntil(decisionDeadline) : null

  const noTrainer = !schedule.trainer?.name
  const noVenue = schedule.modality !== 'E-learning' && !schedule.venue?.name
  const meetsMin = min > 0 && booked >= min
  const atCapacity = max != null && booked >= max
  const ready = !noTrainer && !noVenue
  const decided = ['Completed', 'Cancelled'].includes(schedule.status)

  // System recommendation, in plain language.
  let recTone: 'ok' | 'warn' | 'danger' | 'info' = 'info'
  let recText = 'Building. Below minimum with time remaining.'
  if (decided) {
    recTone = 'neutral' as any
    recText = `Session ${schedule.status.toLowerCase()}. No decision needed.`
  } else if (meetsMin && ready) {
    recTone = 'ok'; recText = 'Go. Meets minimum and trainer and venue are set.'
  } else if (meetsMin && !ready) {
    recTone = 'warn'; recText = 'Go on numbers, but not ready. Assign the missing trainer or venue.'
  } else if (!meetsMin && daysToDecision != null && daysToDecision <= 0) {
    recTone = 'danger'; recText = 'At risk. Below minimum and the decision date has passed.'
  } else if (!meetsMin && daysToDecision != null && daysToDecision <= 7) {
    recTone = 'warn'; recText = 'At risk. Below minimum with the decision date near.'
  }

  // Derived health sentences. Do not make people read raw numbers.
  const health: string[] = []
  if (min > 0 && booked < min) health.push(`${min - booked} pax below minimum`)
  if (meetsMin) health.push('Minimum reached')
  if (targetRevenue > 0 && targetGap < 0) health.push(`${php(Math.abs(targetGap))} below target`)
  if (daysToDecision != null) {
    health.push(daysToDecision < 0 ? `Decision overdue by ${Math.abs(daysToDecision)}d` : daysToDecision === 0 ? 'Decision due today' : `Decision due in ${daysToDecision}d`)
  }
  if (atCapacity) health.push('Capacity reached')
  if (paidPax > 0 && !meetsMin) health.push(`${paidPax} paid participant${paidPax === 1 ? '' : 's'} at risk if this session does not run`)

  const blockers: string[] = []
  if (noTrainer) blockers.push('No trainer assigned')
  if (noVenue) blockers.push('No venue assigned')

  const run = async (label: string, fn: () => PromiseLike<{ error: any }>, ok: string) => {
    setBusy(label); setMsg(null)
    const { error } = await fn()
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else { setMsg({ ok: true, t: ok }); toast.success(ok); invalidate(['schedule', 'schedules', 'approvals', 'schedule_approvals']) }
    setBusy('')
  }

  const confirmGo = () => {
    if (!meetsMin && !armGo) { setArmGo(true); return }
    setArmGo(false)
    run('go', () => supabase.from('schedule').update({ status: 'Confirmed' }).eq('schedule_id', schedule.schedule_id), 'Session confirmed as Go.')
  }

  const proposeNoGo = () => {
    // A No-Go goes to the business owner as a cancellation request — it must
    // carry a rationale for the audit trail.
    if (!reason.trim()) { setMsg({ ok: false, t: 'A reason is required to propose No-Go.' }); toast.error('A reason is required to propose No-Go.'); return }
    run('nogo', () => supabase.from('approval').insert({
      object_type: 'Schedule cancellation',
      schedule_id: schedule.schedule_id,
      requested_by: profile?.user_id,
      note: `No-Go proposed. Booked ${booked} of ${min} min. ${reason.trim()}`,
    }), 'No-Go proposed. The business owner decides on the Approvals screen.')
  }

  const requestReview = () =>
    run('review', () => supabase.from('approval').insert({
      object_type: 'Session review',
      schedule_id: schedule.schedule_id,
      requested_by: profile?.user_id,
      note: reason || `Review requested. Booked ${booked} of ${min} min.`,
    }), 'Review requested. It is on the Approvals screen.')

  // The recommendation is built from booked/paid counts on the session's orders.
  // Don't present "0 booked/paid" as a real signal while those fetches are
  // pending or failed — gate the whole panel first.
  if (orders.isLoading || approvals.isLoading)
    return <RecordSection title="Go / No-Go decision"><Spinner /></RecordSection>
  if (orders.error || approvals.error)
    return <RecordSection title="Go / No-Go decision"><ErrorNote error={orders.error || approvals.error} /></RecordSection>

  return (
    <RecordSection title="Go / No-Go decision">
      <div style={{ marginBottom: 12 }}>
        <Badge tone={recTone as any}>{recTone === 'ok' ? 'Recommend Go' : recTone === 'danger' ? 'Recommend No-Go' : recTone === 'warn' ? 'Needs attention' : 'Advisory'}</Badge>
        <span style={{ marginLeft: 10, fontWeight: 600 }}>{recText}</span>
      </div>

      <div className="grid gng-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, marginBottom: 14 }}>
        <KeyVal label="Minimum">{min || '—'}</KeyVal>
        <KeyVal label="Booked">{booked}</KeyVal>
        <KeyVal label="Paid">{paidPax}</KeyVal>
        <KeyVal label="Target">{targetPax || '—'}</KeyVal>
        <KeyVal label="Booked revenue">{php(bookedRevenue)}</KeyVal>
        <KeyVal label="Min viable">{php(minViableRevenue)}</KeyVal>
        <KeyVal label="Decision due">{decisionDeadline ? shortDate(decisionDeadline) : '—'}</KeyVal>
      </div>

      {health.length > 0 && (
        <ul className="gng-list">
          {health.map((h, i) => (<li key={i}>{h}</li>))}
        </ul>
      )}

      {blockers.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="k-label" style={{ marginBottom: 6 }}>Readiness blockers</div>
          <div className="chip-row">
            {blockers.map((b) => (<span key={b} className="pill pill-nogo">{b}</span>))}
          </div>
        </div>
      )}

      {(approvals.data?.length || 0) > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="k-label" style={{ marginBottom: 6 }}>Prior decisions</div>
          <div className="gng-prior">
            {approvals.data.map((a: any) => (
              <div key={a.approval_id} className="gng-prior-row">
                <span className={`pill ${a.decision === 'Approved' ? 'pill-go' : a.decision === 'Rejected' ? 'pill-nogo' : 'pill-tentative'}`}>{a.decision}</span>
                <span style={{ fontWeight: 600 }}>{a.object_type}</span>
                <span className="fill-label">{a.note || '—'}</span>
                <span className="fill-label">{shortDate(a.decision_date || a.created_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {canOps(profile?.role) && !decided && (
        <div style={{ marginTop: 14 }}>
          <label className="field"><span>Reason (required for No-Go)</span>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Short reason for the record" />
          </label>
          <div className="toolbar">
            <button className="btn btn-sm" disabled={busy === 'go'} onClick={confirmGo}>
              {armGo ? 'Confirm Go anyway' : 'Confirm Go'}
            </button>
            <button className="btn btn-danger btn-sm" disabled={busy === 'nogo' || !reason.trim()} onClick={proposeNoGo}>Propose No-Go</button>
            <button className="btn btn-ghost btn-sm" disabled={busy === 'review'} onClick={requestReview}>Request review</button>
          </div>
          {armGo && (
            <div className="fill-label" style={{ color: 'var(--tr-amber)', marginTop: 6 }}>
              This session is below its minimum. Confirming Go overrides the recommendation.
            </div>
          )}
          <div className="fill-label" style={{ marginTop: 6 }}>
            No-Go and review requests go to the business owner on the Approvals screen. The system advises, operations decides.
          </div>
          {msg && <div style={{ marginTop: 10 }}><RecordNotice ok={msg.ok}>{msg.t}</RecordNotice></div>}
        </div>
      )}
    </RecordSection>
  )
}
