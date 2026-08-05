'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSessionNotes, useInvalidate, useSessionOrders } from '../hooks/data'
import RosterPanel from './RosterPanel'
import TransferOrder from './TransferOrder'
import CloseSession from './CloseSession'
import CancelSession from './CancelSession'
import { StatusPill, GoPill, ChannelPill, FillBar, Spinner } from './ui'
import { useToast } from './Toast'
import { php } from '../lib/format'
import { lt, formatSegments } from '../lib/labels'
import { shortDate } from '../lib/format'

// Roles allowed to take each action
const canForecast = (r: any) => ['business_owner', 'super_admin'].includes(r)
const canOps = (r: any) => ['operations', 'super_admin'].includes(r)

export default function SessionDrawer({ schedule, channelPax, onClose }: { schedule: any; channelPax: any; onClose: () => void }) {
  const router = useRouter()
  const toast = useToast()
  const { profile } = useAuth()
  const role = profile?.role
  const notes = useSessionNotes(schedule?.schedule_id)
  const invalidate = useInvalidate()
  const [noteText, setNoteText] = useState('')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [fRev, setFRev] = useState(schedule?.forecast_revenue ?? '')
  const [fPax, setFPax] = useState(schedule?.forecast_participants ?? '')
  const [tab, setTab] = useState('overview')
  const [transferring, setTransferring] = useState<any>(null)
  const [closing, setClosing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const sessionOrders = useSessionOrders(schedule?.schedule_id)

  if (!schedule) return null
  const ch = channelPax?.[schedule.schedule_id] || {}

  const postNote = async () => {
    if (!noteText.trim()) return
    setBusy('note')
    const { error } = await supabase.from('session_note').insert({
      schedule_id: schedule.schedule_id,
      author: profile?.user_id,
      note: noteText.trim(),
    })
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else {
      setNoteText('')
      invalidate(['notes'])
      toast.success('Note posted.')
    }
    setBusy('')
  }

  const saveForecast = async () => {
    setBusy('forecast')
    setMsg(null)
    const { error } = await supabase.rpc('fn_set_forecast', {
      p_schedule: schedule.schedule_id,
      p_revenue: fRev === '' ? null : Number(fRev),
      p_pax: fPax === '' ? null : Number(fPax),
    })
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else {
      setMsg({ ok: true, t: 'Forecast saved.' })
      invalidate(['schedules'])
      toast.success('Forecast saved.')
    }
    setBusy('')
  }

  const proposeCancel = async () => {
    setBusy('cancel')
    setMsg(null)
    const { error } = await supabase.from('approval').insert({
      object_type: 'Schedule cancellation',
      schedule_id: schedule.schedule_id,
      requested_by: profile?.user_id,
      note: `Proposed from calendar. Booked ${schedule.booked_participants} of ${schedule.min_participants} min.`,
    })
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else {
      setMsg({ ok: true, t: 'Cancellation proposed. The business owner decides on the Approvals screen.' })
      invalidate(['approvals'])
      toast.success('Cancellation proposed.')
    }
    setBusy('')
  }

  const setStatus = async (status: string) => {
    setBusy('status')
    setMsg(null)
    const { error } = await supabase.from('schedule').update({ status }).eq('schedule_id', schedule.schedule_id)
    if (error) { setMsg({ ok: false, t: error.message }); toast.error(error.message) }
    else {
      setMsg({ ok: true, t: `Status set to ${status}.` })
      invalidate(['schedules'])
      toast.success(`Status set to ${status}.`)
    }
    setBusy('')
  }

  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{schedule.course?.course_name}</div>
            <div className="muted" style={{ fontSize: 13 }}>
              {formatSegments(schedule.date_segments, schedule.start_date, schedule.end_date)} · {lt(schedule.modality)} · {schedule.course?.training_type}
            </div>
          </div>
          <button className="linkbtn" onClick={onClose}>Close</button>
        </div>

        <div className="drawer-body">
          <div className="chip-row" style={{ marginBottom: 14 }}>
            <StatusPill value={schedule.status} />
            <GoPill value={schedule.go_status} />
            {schedule.private_run && <span className="pill pill-inhouse">Private run</span>}
            {schedule.roster_locked && <span className="pill pill-inside">Roster locked</span>}
          </div>

          <div className="tabbar">
            {['overview', 'orders', 'participants', 'notes'].map((t) => (
              <button key={t} className={`tab ${tab === t ? 'tab-on' : ''}`} onClick={() => setTab(t)}>
                {t === 'orders' ? `Orders (${sessionOrders.data?.length ?? 0})` : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === 'overview' && (<>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
            <div>
              <div className="k-label">Fill</div>
              <FillBar booked={schedule.booked_participants} min={schedule.min_participants} />
            </div>
            <div>
              <div className="k-label">Fee</div>
              <div style={{ fontWeight: 600 }}>{php(schedule.price)}</div>
            </div>
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginBottom: 16 }}>
            <div>
              <div className="k-label">Trainer</div>
              <div style={{ fontWeight: 600 }}>
                {schedule.trainer?.name || <span className="muted" style={{ fontWeight: 400 }}>Not assigned</span>}
              </div>
            </div>
            <div>
              <div className="k-label">Venue</div>
              <div style={{ fontWeight: 600 }}>
                {schedule.venue?.name || <span className="muted" style={{ fontWeight: 400 }}>Not assigned</span>}
              </div>
            </div>
          </div>

          <div className="k-label" style={{ marginBottom: 6 }}>Pax by channel</div>
          <div className="chip-row" style={{ marginBottom: 18 }}>
            {Object.entries(ch).length === 0 && <span className="muted fill-label">No orders yet</span>}
            {Object.entries(ch).map(([c, n]) => (
              <span key={c} className="fill-label" style={{ display: 'inline-flex', gap: 4 }}>
                <ChannelPill value={c} /> {n as any}
              </span>
            ))}
          </div>

          </>)}

          {tab === 'orders' && (
            <div>
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
                          <div className="fill-label">{l.order?.order_id} · {shortDate(l.order?.order_date)}</div>
                        </td>
                        <td><ChannelPill value={l.order?.channel} /></td>
                        <td>{l.seats}</td>
                        <td className="fill-label">{l.order?.payment_status}</td>
                        <td className="right">
                          <button className="linkbtn" onClick={() => setTransferring(l)}>Transfer</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'participants' && <RosterPanel schedule={schedule} />}

          {tab === 'overview' && canForecast(role) && (
            <div className="drawer-section">
              <div className="k-label" style={{ marginBottom: 8 }}>Forecast (business owner)</div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="field"><span>Revenue PHP</span>
                  <input type="number" value={fRev} onChange={(e) => setFRev(e.target.value)} /></label>
                <label className="field"><span>Participants</span>
                  <input type="number" value={fPax} onChange={(e) => setFPax(e.target.value)} /></label>
              </div>
              <button className="btn btn-sm" onClick={saveForecast} disabled={busy === 'forecast'}>
                {busy === 'forecast' ? 'Saving…' : 'Save forecast'}
              </button>
            </div>
          )}

          {tab === 'overview' && canOps(role) && (
            <div className="drawer-section">
              <div className="k-label" style={{ marginBottom: 8 }}>Session status (operations)</div>
              <div className="toolbar">
                {['Tentative', 'Confirmed', 'Running', 'Completed'].map((s) => (
                  <button key={s} className="btn btn-ghost btn-sm" disabled={busy === 'status' || schedule.status === s}
                    onClick={() => setStatus(s)}>{s}</button>
                ))}
                {schedule.status !== 'Completed' && (
                  <button className="btn btn-sm" onClick={() => setClosing(true)}>Close session</button>
                )}
                <button className="btn btn-danger btn-sm" disabled={busy === 'cancel'} onClick={proposeCancel}>
                  Propose cancellation
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setCancelling(true)}>
                  Cancel with dispositions
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/session/new?clone=${schedule.schedule_id}`)}>
                  Clone
                </button>
              </div>
              <div className="fill-label" style={{ marginTop: 6 }}>
                Cancellation needs business owner approval before the session closes.
              </div>
            </div>
          )}

          {msg && (
            <div className={`notice ${msg.ok ? 'notice-info' : 'notice-error'}`} style={{ margin: '12px 0' }}>{msg.t}</div>
          )}

          {tab === 'notes' && (
          <div className="drawer-section" style={{ borderTop: 'none', marginTop: 0, paddingTop: 0 }}>
            <div className="k-label" style={{ marginBottom: 8 }}>Conversation</div>
            <div className="toolbar" style={{ marginBottom: 10 }}>
              <input placeholder="Add a note…" value={noteText} onChange={(e) => setNoteText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && postNote()} />
              <button className="btn btn-sm" onClick={postNote} disabled={busy === 'note'}>Post</button>
            </div>
            {notes.isLoading ? (
              <Spinner />
            ) : notes.data?.length === 0 ? (
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
        </div>
      </div>
      {closing && (
        <CloseSession schedule={schedule} onDone={onClose} onClose={() => setClosing(false)} />
      )}
      {cancelling && (
        <CancelSession schedule={schedule} onDone={onClose} onClose={() => setCancelling(false)} />
      )}
      {transferring && (
        <TransferOrder
          order={transferring}
          courseId={schedule.course_id}
          fromScheduleId={schedule.schedule_id}
          onClose={(done?: boolean) => { setTransferring(null); if (done) onClose() }}
        />
      )}
    </div>
  )
}
