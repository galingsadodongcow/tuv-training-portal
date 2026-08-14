'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSchedule, useChannelPax, useSessionNotes, useSessionOrders, useInvalidate,
  useScheduleApprovals, useEntityActivity, useAuditTrail, useSessionPnl } from '../hooks/data'
import ActivityTimeline from './ActivityTimeline'
import { noteEvents, approvalEvents, taskEvents, notificationEvents, auditEvents, mergeActivity } from '../lib/activity'
import RosterPanel from './RosterPanel'
import AttachmentsPanel from './AttachmentsPanel'
import FeedbackPanel from './FeedbackPanel'
import TransferOrder from './TransferOrder'
import CloseSession from './CloseSession'
import CancelSession from './CancelSession'
import GoNoGoPanel from './GoNoGoPanel'
import { ChannelPill, FillBar, Spinner, ErrorNote } from './ui'
import { RecordTabs, RecordSection, KeyVal, RecordNotice } from './record'
import { useToast } from './Toast'
import { useConfirm } from './Confirm'
import { php, shortDate } from '../lib/format'

const canForecast = (r: any) => ['business_owner', 'super_admin'].includes(r)
const canOps = (r: any) => ['operations', 'super_admin'].includes(r)
// Mirrors fn_cost_visible() in 20260814090000 and the Analytics REPORT list.
// The database masks cost regardless — this only avoids rendering a
// Profitability panel full of dashes to a role that may not see it.
const canSeeCost = (r: any) =>
  ['super_admin', 'operations', 'business_owner', 'management', 'auditor'].includes(r)

// Tab keys, plus the legacy deep-links that were folded into Activity.
export const SESSION_TABS = ['overview', 'orders', 'participants', 'files', 'activity'] as const
export const normaliseSessionTab = (raw?: string | null) =>
  ['notes', 'history', 'feedback'].includes(raw || '') ? 'activity' : (raw || 'overview')

// The tabbed body of a session record — everything under the header. Rendered by
// both the /session/[id] page and the calendar's side drawer so the two cannot
// drift apart (the drawer used to be a hand-rolled subset and had already fallen
// behind the full view). Controlled: the host owns the active tab, because the
// page keeps it in the URL while the drawer keeps it in local state.
//
// It loads the record itself rather than taking one as a prop: the calendar's
// list rows carry a thinner projection than useSchedule returns, and re-fetching
// by the same query key is deduped/cached by TanStack anyway.
export default function SessionRecord({
  scheduleId, tab, onTabChange, variant = 'page',
}: {
  scheduleId: string
  tab: string
  onTabChange: (t: string) => void
  /** 'drawer' trims chrome the drawer already shows in its own header. */
  variant?: 'page' | 'drawer'
}) {
  const router = useRouter()
  const toast = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const role = profile?.role

  const sched = useSchedule(scheduleId)
  const paxAll = useChannelPax()
  const notes = useSessionNotes(scheduleId)
  const sessionOrders = useSessionOrders(scheduleId)
  const schedApprovals = useScheduleApprovals(scheduleId)
  const activity = useEntityActivity('schedule', scheduleId)
  const audit = useAuditTrail('schedule', scheduleId)
  const pnl = useSessionPnl(scheduleId)
  const invalidate = useInvalidate()

  const [noteText, setNoteText] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [fRev, setFRev] = useState('')
  const [fPax, setFPax] = useState('')
  const [forecastInit, setForecastInit] = useState(false)
  const [transferring, setTransferring] = useState<any>(null)
  const [closing, setClosing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [statusMore, setStatusMore] = useState(false)

  // Seed the forecast inputs once the record arrives — in an effect, not during
  // render, so we never call setState mid-render.
  useEffect(() => {
    if (forecastInit || !sched.data) return
    setFRev(sched.data.forecast_revenue ?? '')
    setFPax(sched.data.forecast_participants ?? '')
    setForecastInit(true)
  }, [sched.data, forecastInit])

  const timeline = useMemo(() => mergeActivity(
    noteEvents(notes.data),
    approvalEvents(schedApprovals.data),
    taskEvents(activity.data?.tasks),
    notificationEvents(activity.data?.notifs),
    auditEvents(audit.data),
  ), [notes.data, schedApprovals.data, activity.data, audit.data])

  if (sched.isLoading) return <Spinner label="Loading session" />
  if (sched.error) return <ErrorNote error={sched.error} />
  const schedule = sched.data
  if (!schedule) {
    return <div className="card"><div className="empty">This session does not exist or you cannot access it.</div></div>
  }

  const ch = paxAll.data?.[schedule.schedule_id] || {}

  const postNote = async () => {
    if (!noteText.trim()) return
    setBusy('note')
    const { error } = await supabase.from('session_note').insert({
      schedule_id: schedule.schedule_id,
      author: profile?.user_id,
      note: noteText.trim(),
    })
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else { setNoteText(''); invalidate(['notes']); toast.success('Note posted.') }
    setBusy('')
  }

  const saveForecast = async () => {
    setBusy('forecast'); setMsg(null)
    const { error } = await supabase.rpc('fn_set_forecast', {
      p_schedule: schedule.schedule_id,
      p_revenue: fRev === '' ? null : Number(fRev),
      p_pax: fPax === '' ? null : Number(fPax),
    })
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else { setMsg({ ok: true, t: 'Forecast saved.' }); invalidate(['schedule', 'schedules']); toast.success('Forecast saved.') }
    setBusy('')
  }

  const setLineStatus = async (line: any, status: string) => {
    setBusy('line'); setMsg(null)
    const { error } = await supabase.from('order_line').update({ line_status: status }).eq('line_id', line.line_id)
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else {
      invalidate(['session_orders', 'schedule', 'schedules', 'channel_pax', 'roster'])
      toast.success(status === 'Waitlist' ? 'Moved to the waitlist.' : 'Promoted to a seat.')
    }
    setBusy('')
  }

  // #133: the raw status write is no longer a confirmation path — Go/No-Go is.
  // It survives only as a super-admin correction tool: reason-gated, and the
  // reason is recorded on the session timeline so a manual override is never
  // silent or divergent from the audit trail.
  const correctStatus = async (status: string) => {
    const res = await confirm({
      title: `Force status to ${status}?`,
      body: 'Super-admin correction only. This bypasses the Go / No-Go decision and its approval trail — use it solely to fix a wrong status. The reason is recorded on the session timeline.',
      confirmLabel: `Set ${status}`, tone: 'danger', reason: 'required', reasonLabel: 'Reason for the correction',
    })
    if (!res.ok) return
    setBusy('status'); setMsg(null)
    const { error } = await supabase.from('schedule').update({ status }).eq('schedule_id', schedule.schedule_id)
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message); setBusy(''); return }
    await supabase.from('session_note').insert({
      schedule_id: schedule.schedule_id, author: profile?.user_id,
      note: `Status corrected to ${status}, bypassing Go/No-Go: ${res.reason}`,
    })
    setMsg({ ok: true, t: `Status set to ${status}.` }); invalidate(['schedule', 'schedules', 'notes']); toast.success(`Status set to ${status}.`)
    setBusy('')
  }

  const waitCount = (sessionOrders.data || []).filter((l: any) => l.line_status === 'Waitlist').length
  const bookedCount = (sessionOrders.data || []).filter((l: any) => ['New', 'Confirmed', 'Completed'].includes(l.line_status)).length
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'orders', label: `Orders (${bookedCount})${waitCount ? ` · ${waitCount} waitlisted` : ''}` },
    { key: 'participants', label: 'Participants' },
    { key: 'files', label: 'Files' },
    { key: 'activity', label: `Activity${notes.data?.length ? ` (${notes.data.length})` : ''}` },
  ]

  return (
    <>
      <RecordTabs tabs={tabs} active={tab} onChange={onTabChange} />

      {tab === 'overview' && (
        <div className="card card-pad">
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
            <KeyVal label="Fill">
              <FillBar booked={schedule.booked_participants} min={schedule.min_participants} />
              {waitCount > 0 && (
                <div className="fill-label" style={{ marginTop: 4, color: 'var(--warning)' }}>
                  {waitCount} on the waitlist{schedule.max_participants != null && schedule.booked_participants < schedule.max_participants ? ' · seats open, promote from Orders' : ''}
                </div>
              )}
            </KeyVal>
            <KeyVal label="Fee">{php(schedule.price)}</KeyVal>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
            <KeyVal label="Trainer">{schedule.trainer?.name || <span className="muted">Not assigned</span>}</KeyVal>
            <KeyVal label="Venue">{schedule.venue?.name || <span className="muted">Not assigned</span>}</KeyVal>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
            <KeyVal label="Operations owner">{schedule.opsOwner?.full_name || <span className="muted">Unassigned</span>}</KeyVal>
            <KeyVal label="Sales owner">{schedule.salesOwner?.name || <span className="muted">Unassigned</span>}</KeyVal>
          </div>

          <div className="k-label" style={{ marginBottom: 6 }}>Pax by channel</div>
          <div className="chip-row">
            {Object.entries(ch).length === 0 && <span className="muted fill-label">No orders yet</span>}
            {Object.entries(ch).map(([c, n]) => (
              <span key={c} className="fill-label" style={{ display: 'inline-flex', gap: 4 }}>
                <ChannelPill value={c} /> {n as any}
              </span>
            ))}
          </div>

          {pnl.data && canSeeCost(role) && (
            <RecordSection title="Profitability">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                <KeyVal label="Revenue">{php(Number(pnl.data.revenue))}</KeyVal>
                <KeyVal label="Trainer cost">{php(Number(pnl.data.trainer_cost))}</KeyVal>
                <KeyVal label="Venue cost">{php(Number(pnl.data.venue_cost))}</KeyVal>
                <KeyVal label="Materials">
                  {canOps(role) ? (
                    <input aria-label="Material cost" type="number" min="0" defaultValue={pnl.data.material_cost}
                      onBlur={(e) => { if (Number(e.target.value) !== Number(pnl.data.material_cost)) { supabase.from('schedule').update({ material_cost: Number(e.target.value) || 0 }).eq('schedule_id', scheduleId).then(() => invalidate(['session_pnl'])) } }}
                      style={{ width: 100 }} />
                  ) : php(Number(pnl.data.material_cost))}
                </KeyVal>
                <KeyVal label="Margin">
                  <span style={{ color: Number(pnl.data.margin) >= 0 ? 'var(--success, var(--accent))' : 'var(--danger)', fontWeight: 700 }}>
                    {php(Number(pnl.data.margin))}
                  </span>
                  {Number(pnl.data.revenue) > 0 && <span className="fill-label"> · {Math.round(Number(pnl.data.margin) / Number(pnl.data.revenue) * 100)}%</span>}
                </KeyVal>
              </div>
            </RecordSection>
          )}

          <GoNoGoPanel schedule={schedule} />

          {canForecast(role) && (
            <RecordSection title="Forecast (business owner)">
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="field"><span>Revenue PHP</span>
                  <input type="number" value={fRev} onChange={(e) => setFRev(e.target.value)} /></label>
                <label className="field"><span>Participants</span>
                  <input type="number" value={fPax} onChange={(e) => setFPax(e.target.value)} /></label>
              </div>
              <button className="btn btn-sm" onClick={saveForecast} disabled={busy === 'forecast'}>
                {busy === 'forecast' ? 'Saving…' : 'Save forecast'}
              </button>
            </RecordSection>
          )}

          {canOps(role) && (
            <RecordSection title="Session status (operations)">
              {/* Confirmation is the Go / No-Go decision above — the single path
                  (#133). Here ops closes, cancels or clones; the raw status
                  override is a super-admin correction tool only. */}
              <div className="toolbar">
                {schedule.status === 'Tentative' ? (
                  <span className="fill-label">Confirm this session with the <strong>Go / No-Go decision</strong> above.</span>
                ) : schedule.status !== 'Completed' ? (
                  <button className="btn" onClick={() => setClosing(true)}>Close session</button>
                ) : null}
                <button className="btn btn-ghost btn-sm" onClick={() => setStatusMore((v) => !v)}>{statusMore ? 'Fewer actions' : 'More actions'}</button>
              </div>
              {statusMore && (
                <>
                  <div className="toolbar" style={{ marginTop: 8 }}>
                    {schedule.status !== 'Completed' && <button className="btn btn-ghost btn-sm" onClick={() => setClosing(true)}>Close session</button>}
                    <button className="btn btn-ghost btn-sm" onClick={() => setCancelling(true)}>Cancel with dispositions</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/session/new?clone=${schedule.schedule_id}`)}>Clone</button>
                  </div>
                  {role === 'super_admin' && (
                    <div style={{ marginTop: 10 }}>
                      <div className="fill-label" style={{ marginBottom: 4 }}>Correct status (super-admin, reason-gated — bypasses Go/No-Go):</div>
                      <div className="toolbar">
                        {['Tentative', 'Confirmed', 'Running', 'Completed'].map((s) => (
                          <button key={s} className="btn btn-ghost btn-sm" disabled={busy === 'status' || schedule.status === s} onClick={() => correctStatus(s)}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              <div className="fill-label" style={{ marginTop: 6 }}>
                Cancellation needs business owner approval before the session closes.
              </div>
            </RecordSection>
          )}

          {msg && <div style={{ marginTop: 12 }}><RecordNotice ok={msg.ok}>{msg.t}</RecordNotice></div>}
        </div>
      )}

      {tab === 'orders' && (() => {
        const all = sessionOrders.data || []
        const booked = all.filter((l: any) => ['New', 'Confirmed', 'Completed'].includes(l.line_status))
        const waiting = all.filter((l: any) => l.line_status === 'Waitlist')
        const seatsLeft = schedule.max_participants == null ? null : schedule.max_participants - schedule.booked_participants
        const row = (l: any, kind: 'booked' | 'waiting') => (
          <tr key={l.line_id}>
            <td>
              <div style={{ fontWeight: 600 }}>{l.order?.client?.company || l.order?.client?.name || '—'}</div>
              <div className="fill-label">
                <Link href={`/orders/${l.order?.order_id}`}>{l.order?.order_id}</Link> · {shortDate(l.order?.order_date)}
              </div>
            </td>
            <td><ChannelPill value={l.order?.channel} /></td>
            <td>{l.seats}</td>
            <td className="fill-label">{l.order?.payment_status}</td>
            <td className="right">
              <div className="toolbar" style={{ gap: 6, justifyContent: 'flex-end' }}>
                {canOps(role) && kind === 'booked' && (
                  <button className="linkbtn" disabled={busy === 'line'} onClick={() => setLineStatus(l, 'Waitlist')}>Waitlist</button>
                )}
                {canOps(role) && kind === 'waiting' && (
                  <button className="btn btn-sm" disabled={busy === 'line'} onClick={() => setLineStatus(l, 'New')}>Promote</button>
                )}
                <button className="linkbtn" onClick={() => setTransferring(l)}>Move booking</button>
              </div>
            </td>
          </tr>
        )
        return (
          <div className="card">
            {sessionOrders.isLoading ? <Spinner /> : all.length === 0 ? (
              <div className="empty">No bookings on this session yet.</div>
            ) : (
              <>
                {booked.length > 0 && (
                  <div className="scroll-x">
                  <table>
                    <thead><tr><th>Client</th><th>Channel</th><th>Seats</th><th>Payment</th><th></th></tr></thead>
                    <tbody>{booked.map((l: any) => row(l, 'booked'))}</tbody>
                  </table>
                  </div>
                )}
                {waiting.length > 0 && (
                  <div style={{ padding: '14px 16px 0' }}>
                    <div className="k-label" style={{ marginBottom: 6 }}>
                      Waitlist ({waiting.length})
                      {seatsLeft != null && seatsLeft > 0 && <span className="fill-label" style={{ fontWeight: 400 }}> · {seatsLeft} seat{seatsLeft === 1 ? '' : 's'} open, promote to fill</span>}
                    </div>
                    <div className="scroll-x">
                    <table>
                      <thead><tr><th>Client</th><th>Channel</th><th>Seats</th><th>Payment</th><th></th></tr></thead>
                      <tbody>{waiting.map((l: any) => row(l, 'waiting'))}</tbody>
                    </table>
                    </div>
                  </div>
                )}
                {booked.length === 0 && waiting.length === 0 && <div className="empty">No live bookings on this session.</div>}
              </>
            )}
          </div>
        )
      })()}

      {tab === 'participants' && <div className="card card-pad"><RosterPanel schedule={schedule} /></div>}

      {tab === 'files' && (
        <div className="card card-pad"><AttachmentsPanel entityType="session" entityId={schedule.schedule_id} /></div>
      )}

      {tab === 'activity' && (
        <>
          <div className="card card-pad">
            {/* Post a note, then the full timeline (notes, approvals, tasks, audit) below. */}
            <div className="toolbar" style={{ marginBottom: 14 }}>
              <input aria-label="Add a note" placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && postNote()} />
              <button className="btn btn-sm" onClick={postNote} disabled={busy === 'note'}>Post</button>
            </div>
            <ActivityTimeline events={timeline} loading={notes.isLoading || schedApprovals.isLoading || activity.isLoading} />
          </div>
          {/* Participant feedback folded in from the retired Feedback tab (post-session, low-frequency). */}
          <div style={{ marginTop: 16 }}><FeedbackPanel scheduleId={schedule.schedule_id} /></div>
        </>
      )}

      {variant === 'drawer' && (
        <div className="toolbar" style={{ marginTop: 16 }}>
          <Link href={`/session/${schedule.schedule_id}`} className="btn">Open full session →</Link>
        </div>
      )}

      {closing && <CloseSession schedule={schedule} onDone={() => setClosing(false)} onClose={() => setClosing(false)} />}
      {cancelling && <CancelSession schedule={schedule} onDone={() => setCancelling(false)} onClose={() => setCancelling(false)} />}
      {transferring && (
        <TransferOrder
          order={transferring}
          courseId={schedule.course_id}
          fromScheduleId={schedule.schedule_id}
          onClose={(done?: boolean) => { setTransferring(null); if (done) invalidate(['session_orders', 'schedule', 'channel_pax']) }}
        />
      )}
    </>
  )
}
