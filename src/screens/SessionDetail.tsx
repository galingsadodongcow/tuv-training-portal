'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSchedule, useChannelPax, useSessionNotes, useSessionOrders, useInvalidate, useScheduleApprovals, useEntityActivity, useAuditTrail, useSessionPnl, useSessionHealth } from '../hooks/data'
import { healthMeta } from '../lib/health'
import ActivityTimeline from '../components/ActivityTimeline'
import { noteEvents, approvalEvents, taskEvents, notificationEvents, auditEvents, mergeActivity } from '../lib/activity'
import RosterPanel from '../components/RosterPanel'
import AttachmentsPanel from '../components/AttachmentsPanel'
import FeedbackPanel from '../components/FeedbackPanel'
import TransferOrder from '../components/TransferOrder'
import CloseSession from '../components/CloseSession'
import CancelSession from '../components/CancelSession'
import GoNoGoPanel from '../components/GoNoGoPanel'
import { StatusPill, GoPill, ChannelPill, FillBar, Spinner, ErrorNote } from '../components/ui'
import { RecordHeader, RecordTabs, RecordSection, KeyVal, RecordNotice } from '../components/record'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { php, shortDate } from '../lib/format'
import { lt, formatSegments } from '../lib/labels'

const canForecast = (r: any) => ['business_owner', 'super_admin'].includes(r)
const canOps = (r: any) => ['operations', 'super_admin'].includes(r)

export default function SessionDetail() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  // Notes + History merged into one "Activity" tab; keep the old deep-links alive.
  const rawTab = search.get('tab') || 'overview'
  const tab = rawTab === 'notes' || rawTab === 'history' ? 'activity' : rawTab
  const setTab = (t: string) => {
    const n = new URLSearchParams(search.toString())
    if (t === 'overview') n.delete('tab')
    else n.set('tab', t)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  const toast = useToast()
  const confirm = useConfirm()
  const { profile } = useAuth()
  const role = profile?.role
  const sched = useSchedule(id)
  const paxAll = useChannelPax()
  const notes = useSessionNotes(id)
  const sessionOrders = useSessionOrders(id)
  const schedApprovals = useScheduleApprovals(id)
  const activity = useEntityActivity('schedule', id)
  const audit = useAuditTrail('schedule', id)
  const pnl = useSessionPnl(id)
  const healthAll = useSessionHealth()
  const healthMap = useMemo(
    () => new Map<string, string>((healthAll.data || []).map((h: any) => [h.schedule_id, h.health])),
    [healthAll.data]
  )
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

  // Seed the forecast inputs once the record arrives — in an effect, not during
  // render, so we never call setState mid-render.
  useEffect(() => {
    if (forecastInit || !sched.data) return
    setFRev(sched.data.forecast_revenue ?? '')
    setFPax(sched.data.forecast_participants ?? '')
    setForecastInit(true)
  }, [sched.data, forecastInit])

  if (sched.isLoading) return <Spinner label="Loading session" />
  if (sched.error) return <ErrorNote error={sched.error} />
  const schedule = sched.data
  if (!schedule) {
    return (
      <>
        <RecordHeader title="Session not found" back={{ href: '/calendar', label: 'Calendar' }} />
        <div className="card"><div className="empty">This session does not exist or you cannot access it.</div></div>
      </>
    )
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

  const setStatus = async (status: string) => {
    // Completing a session affects its bookings and roster: confirm first.
    if (status === 'Completed') {
      const res = await confirm({
        title: 'Mark this session Completed?',
        body: 'This affects its bookings and roster and cannot be undone from here.',
        confirmLabel: 'Mark completed',
        reason: 'optional',
      })
      if (!res.ok) return
    }
    setBusy('status'); setMsg(null)
    const { error } = await supabase.from('schedule').update({ status }).eq('schedule_id', schedule.schedule_id)
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else { setMsg({ ok: true, t: `Status set to ${status}.` }); invalidate(['schedule', 'schedules']); toast.success(`Status set to ${status}.`) }
    setBusy('')
  }

  const timeline = mergeActivity(
    noteEvents(notes.data),
    approvalEvents(schedApprovals.data),
    taskEvents(activity.data?.tasks),
    notificationEvents(activity.data?.notifs),
    auditEvents(audit.data)
  )

  const waitCount = (sessionOrders.data || []).filter((l: any) => l.line_status === 'Waitlist').length
  const bookedCount = (sessionOrders.data || []).filter((l: any) => ['New', 'Confirmed', 'Completed'].includes(l.line_status)).length
  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'orders', label: `Orders (${bookedCount})${waitCount ? ` · ${waitCount} waitlisted` : ''}` },
    { key: 'participants', label: 'Participants' },
    { key: 'files', label: 'Files' },
    { key: 'feedback', label: 'Feedback' },
    { key: 'activity', label: `Activity${notes.data?.length ? ` (${notes.data.length})` : ''}` },
  ]

  return (
    <>
      <RecordHeader
        crumbs={[{ href: '/my-work', label: 'My Work' }, { href: '/calendar', label: 'Calendar' }, { label: schedule.course?.course_name || 'Session' }]}
        title={schedule.course?.course_name}
        subtitle={`${formatSegments(schedule.date_segments, schedule.start_date, schedule.end_date)} · ${lt(schedule.modality)} · ${schedule.course?.training_type}`}
        badges={
          <>
            <StatusPill value={schedule.status} />
            <GoPill value={schedule.go_status} />
            {(() => {
              // Health duplicates the status once a session is Completed/Cancelled, so only show it while live.
              const h = healthMap.get(schedule.schedule_id)
              return h && h !== 'Completed' && h !== 'Cancelled'
                ? <span className={`pill ${healthMeta(h).cls}`}>{healthMeta(h).label}</span>
                : null
            })()}
            {schedule.private_run && <span className="pill pill-inhouse">Private run</span>}
            {schedule.roster_locked && <span className="pill pill-inside">Roster locked</span>}
          </>
        }
        actions={
          canOps(role) && <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/session/${schedule.schedule_id}/edit`)}>Edit session</button>
        }
      />

      <RecordTabs tabs={tabs} active={tab} onChange={setTab} />

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

          {pnl.data && (
            <RecordSection title="Profitability">
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
                <KeyVal label="Revenue">{php(Number(pnl.data.revenue))}</KeyVal>
                <KeyVal label="Trainer cost">{php(Number(pnl.data.trainer_cost))}</KeyVal>
                <KeyVal label="Venue cost">{php(Number(pnl.data.venue_cost))}</KeyVal>
                <KeyVal label="Materials">
                  {canOps(role) ? (
                    <input aria-label="Material cost" type="number" min="0" defaultValue={pnl.data.material_cost}
                      onBlur={(e) => { if (Number(e.target.value) !== Number(pnl.data.material_cost)) { supabase.from('schedule').update({ material_cost: Number(e.target.value) || 0 }).eq('schedule_id', id).then(() => invalidate(['session_pnl'])) } }}
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
              <div className="toolbar">
                {['Tentative', 'Confirmed', 'Running', 'Completed'].map((s) => (
                  <button key={s} className="btn btn-ghost btn-sm" disabled={busy === 'status' || schedule.status === s} onClick={() => setStatus(s)}>{s}</button>
                ))}
                {schedule.status !== 'Completed' && <button className="btn btn-sm" onClick={() => setClosing(true)}>Close session</button>}
                <button className="btn btn-ghost btn-sm" onClick={() => setCancelling(true)}>Cancel with dispositions</button>
                <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/session/new?clone=${schedule.schedule_id}`)}>Clone</button>
              </div>
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
                <button className="linkbtn" onClick={() => setTransferring(l)}>Transfer</button>
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
                  <table>
                    <thead><tr><th>Client</th><th>Channel</th><th>Seats</th><th>Payment</th><th></th></tr></thead>
                    <tbody>{booked.map((l: any) => row(l, 'booked'))}</tbody>
                  </table>
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

      {tab === 'feedback' && <FeedbackPanel scheduleId={schedule.schedule_id} />}

      {tab === 'activity' && (
        <div className="card card-pad">
          {/* Post a note, then the full timeline (notes, approvals, tasks, audit) below. */}
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <input aria-label="Add a note" placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && postNote()} />
            <button className="btn btn-sm" onClick={postNote} disabled={busy === 'note'}>Post</button>
          </div>
          <ActivityTimeline events={timeline} loading={notes.isLoading || schedApprovals.isLoading || activity.isLoading} />
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
