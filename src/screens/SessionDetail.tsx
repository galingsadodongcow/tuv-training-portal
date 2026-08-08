'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSchedule, useChannelPax, useSessionNotes, useSessionOrders, useInvalidate, useScheduleApprovals, useEntityActivity, useAuditTrail } from '../hooks/data'
import ActivityTimeline from '../components/ActivityTimeline'
import { noteEvents, approvalEvents, taskEvents, notificationEvents, auditEvents, mergeActivity } from '../lib/activity'
import RosterPanel from '../components/RosterPanel'
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
  const tab = search.get('tab') || 'overview'
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

  // Seed the forecast inputs once the record arrives.
  if (!forecastInit) {
    setFRev(schedule.forecast_revenue ?? '')
    setFPax(schedule.forecast_participants ?? '')
    setForecastInit(true)
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

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'orders', label: `Orders (${sessionOrders.data?.length ?? 0})` },
    { key: 'participants', label: 'Participants' },
    { key: 'notes', label: 'Notes' },
    { key: 'history', label: 'History' },
  ]

  return (
    <>
      <RecordHeader
        back={{ href: '/calendar', label: 'Calendar' }}
        title={schedule.course?.course_name}
        subtitle={`${formatSegments(schedule.date_segments, schedule.start_date, schedule.end_date)} · ${lt(schedule.modality)} · ${schedule.course?.training_type}`}
        badges={
          <>
            <StatusPill value={schedule.status} />
            <GoPill value={schedule.go_status} />
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
            <KeyVal label="Fill"><FillBar booked={schedule.booked_participants} min={schedule.min_participants} /></KeyVal>
            <KeyVal label="Fee">{php(schedule.price)}</KeyVal>
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
            <KeyVal label="Trainer">{schedule.trainer?.name || <span className="muted">Not assigned</span>}</KeyVal>
            <KeyVal label="Venue">{schedule.venue?.name || <span className="muted">Not assigned</span>}</KeyVal>
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

      {tab === 'orders' && (
        <div className="card">
          {sessionOrders.isLoading ? <Spinner /> : sessionOrders.data?.length === 0 ? (
            <div className="empty">No bookings on this session yet.</div>
          ) : (
            <table>
              <thead><tr><th>Client</th><th>Channel</th><th>Seats</th><th>Payment</th><th></th></tr></thead>
              <tbody>
                {sessionOrders.data?.map((l: any) => (
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
                    <td className="right"><button className="linkbtn" onClick={() => setTransferring(l)}>Transfer</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'participants' && <div className="card card-pad"><RosterPanel schedule={schedule} /></div>}

      {tab === 'notes' && (
        <div className="card card-pad">
          <div className="toolbar" style={{ marginBottom: 10 }}>
            <input placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && postNote()} />
            <button className="btn btn-sm" onClick={postNote} disabled={busy === 'note'}>Post</button>
          </div>
          {notes.isLoading ? <Spinner /> : notes.data?.length === 0 ? (
            <div className="muted fill-label">No notes yet. Start the thread.</div>
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
        </div>
      )}

      {tab === 'history' && (
        <div className="card card-pad">
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
