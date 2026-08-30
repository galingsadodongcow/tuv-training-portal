import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import {
  issueCertificateAction,
  recordParticipantOutcomeAction,
  registerParticipantAction,
  rescheduleSessionAction,
  revokeCertificateAction,
  transitionParticipantAction,
  transitionSessionAction,
  transferParticipantAction,
} from '@/features/delivery/actions'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displayParticipantNumber, displaySessionNumber, formatSessionDate, formatSessionTime, sessionSeatSummary } from '@/features/delivery/rules'
import { displayNumber } from '@/features/sales/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageDelivery, canViewDelivery } from '@/lib/permissions'

function dateTimeLocal(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`
}

export default async function SessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewDelivery(profile.role)) redirect('/')
  const [{ id }, notice, workspace] = await Promise.all([params, searchParams, getDeliveryWorkspace()])
  const session = workspace.sessions.find((item) => item.id === id)
  if (!session) notFound()

  const canManage = canManageDelivery(profile.role)
  const roster = workspace.participants.filter((item) => item.session_id === session.id)
  const seats = sessionSeatSummary(session, workspace.participants)
  const order = workspace.orders.find((item) => item.id === session.order_id)
  const course = workspace.courses.find((item) => item.id === session.course_id)
  const trainer = workspace.trainers.find((item) => item.id === session.trainer_id)
  const venue = workspace.venues.find((item) => item.id === session.venue_id)
  const customer = workspace.customers.find((item) => item.id === order?.customer_id)
  const owner = workspace.profiles.find((item) => item.id === session.operations_owner_id)
  const transferTargets = workspace.sessions.filter((item) => item.id !== session.id && item.course_id === session.course_id && ['scheduled', 'open'].includes(item.status))
  const activeRoster = roster.filter((item) => !['waitlisted', 'cancelled', 'transferred'].includes(item.status))
  const outcomesComplete = activeRoster.filter((item) => item.attendance_status !== 'pending' && item.assessment_status !== 'pending').length
  const issued = roster.filter((item) => item.certificate_status === 'issued').length
  const durationMinutes = Math.round((new Date(session.ends_at).getTime() - new Date(session.starts_at).getTime()) / 60000)

  return (
    <AppShell profile={profile} active="training">
      <div className="breadcrumb"><Link href="/training">Training delivery</Link><span>/</span><span>{displaySessionNumber(session.session_number)}</span></div>
      <div className="page-heading"><div><p className="eyebrow">{displaySessionNumber(session.session_number)} · {session.learning_type}</p><h1>{course?.title ?? 'Training session'}</h1><p>{customer?.name} · {formatSessionDate(session.starts_at)} · {formatSessionTime(session.starts_at)}–{formatSessionTime(session.ends_at)} Manila time</p></div><span className={`workflow-status status-${session.status}`}>{session.status.replaceAll('_', ' ')}</span></div>
      {notice.message ? <div className="alert alert-success" role="status">{notice.message}</div> : null}
      {notice.error ? <div className="alert alert-error" role="alert">{notice.error}</div> : null}

      <section className="metric-grid" aria-label="Session summary">
        <MetricCard label="Occupied seats" value={`${seats.occupied}/${session.capacity}`} detail={`${seats.available} currently available`} />
        <MetricCard label="Waitlisted" value={seats.waitlisted} detail="Promoted automatically on release" />
        <MetricCard label="Final outcomes" value={`${outcomesComplete}/${activeRoster.length}`} detail="Attendance and assessment" />
        <MetricCard label="Certificates" value={issued} detail="Issued after completion" />
      </section>

      <div className="detail-layout">
        <div>
          <section className="workspace-section" aria-labelledby="plan-title">
            <div className="section-heading"><div><h2 id="plan-title">Delivery plan</h2><p>The session inherits its commercial scope from {order ? displayNumber('ORD', order.order_number) : 'the accepted order'}.</p></div></div>
            <dl className="detail-grid">
              <div><dt>Course</dt><dd>{course?.code}<br />{course?.title}</dd></div>
              <div><dt>Customer</dt><dd>{customer?.name ?? '—'}</dd></div>
              <div><dt>Schedule</dt><dd>{formatSessionDate(session.starts_at)}<br />{formatSessionTime(session.starts_at)}–{formatSessionTime(session.ends_at)}</dd></div>
              <div><dt>Duration window</dt><dd>{durationMinutes.toLocaleString()} minutes</dd></div>
              <div><dt>Trainer</dt><dd>{trainer?.name ?? '—'}</dd></div>
              <div><dt>Venue</dt><dd>{venue?.name ?? '—'}<br /><span className="muted">{venue?.address}</span></dd></div>
              <div><dt>Operations owner</dt><dd>{owner?.full_name ?? '—'}</dd></div>
              <div><dt>Delivery type</dt><dd className="capitalize">{session.learning_type}</dd></div>
              <div className="detail-wide"><dt>Notes</dt><dd>{session.notes ?? 'No additional delivery notes.'}</dd></div>
              {session.cancellation_reason ? <div className="detail-wide"><dt>Cancellation reason</dt><dd>{session.cancellation_reason}</dd></div> : null}
            </dl>
          </section>

          <section className="workspace-section" aria-labelledby="roster-title">
            <div className="section-heading"><div><h2 id="roster-title">Participant roster</h2><p>Seat state, attendance, assessment, and certificate evidence stay on one controlled registration record.</p></div></div>
            {roster.length === 0 ? <EmptyState>No participants are registered.</EmptyState> : (
              <div className="participant-list">
                {roster.map((participant) => (
                  <article className="participant-card" key={participant.id}>
                    <div className="participant-summary">
                      <div><span className="code">{displayParticipantNumber(participant.participant_number)}</span><h3>{participant.full_name}</h3><p>{participant.email ?? participant.phone ?? participant.employee_reference ?? 'No contact detail'}</p></div>
                      <div className="status-cluster"><span className={`workflow-status status-${participant.status}`}>{participant.status.replaceAll('_', ' ')}</span><span className={`workflow-status status-${participant.attendance_status}`}>{participant.attendance_status}</span><span className={`workflow-status status-${participant.certificate_status}`}>{participant.certificate_status.replaceAll('_', ' ')}</span></div>
                    </div>
                    <div className="participant-facts"><span>Employee ref: {participant.employee_reference ?? '—'}</span><span>Assessment: {participant.assessment_status.replaceAll('_', ' ')}{participant.assessment_score !== null ? ` · ${participant.assessment_score}%` : ''}</span><span>Certificate: {participant.certificate_number ?? '—'}</span></div>
                    {canManage ? (
                      <div className="participant-actions">
                        {participant.status === 'registered' ? <form action={transitionParticipantAction}><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="participant_id" value={participant.id} /><input type="hidden" name="transition" value="confirm" /><Button className="button-small" type="submit">Confirm seat</Button></form> : null}
                        {['registered', 'waitlisted', 'confirmed'].includes(participant.status) ? <details><summary>Cancel registration</summary><form action={transitionParticipantAction} className="action-form"><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="participant_id" value={participant.id} /><input type="hidden" name="transition" value="cancel" /><label className="field"><span>Reason</span><input name="reason" minLength={3} required /></label><Button className="button-small" type="submit">Cancel</Button></form></details> : null}
                        {['registered', 'waitlisted', 'confirmed'].includes(participant.status) && transferTargets.length ? <details><summary>Transfer</summary><form action={transferParticipantAction} className="action-form"><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="participant_id" value={participant.id} /><label className="field"><span>Target session</span><select name="target_session_id" required defaultValue=""><option value="" disabled>Select session</option>{transferTargets.map((target) => <option value={target.id} key={target.id}>{displaySessionNumber(target.session_number)} · {formatSessionDate(target.starts_at)}</option>)}</select></label><Button className="button-small" type="submit">Transfer</Button></form></details> : null}
                        {['in_progress', 'completed'].includes(session.status) && ['registered', 'confirmed', 'completed', 'no_show'].includes(participant.status) ? <details><summary>Record outcome</summary><form action={recordParticipantOutcomeAction} className="outcome-form"><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="participant_id" value={participant.id} /><label className="field"><span>Attendance</span><select name="attendance_status" required defaultValue={participant.attendance_status === 'pending' ? '' : participant.attendance_status}><option value="" disabled>Select</option><option value="present">Present</option><option value="partial">Partial</option><option value="absent">Absent</option></select></label><label className="field"><span>Minutes</span><input name="attended_minutes" type="number" min="0" max={durationMinutes} required defaultValue={participant.attended_minutes ?? ''} /></label><label className="field"><span>Assessment</span><select name="assessment_status" required defaultValue={participant.assessment_status === 'pending' ? '' : participant.assessment_status}><option value="" disabled>Select</option><option value="not_required">Not required</option><option value="passed">Passed</option><option value="failed">Failed</option></select></label><label className="field"><span>Score (optional)</span><input name="assessment_score" type="number" min="0" max="100" step="0.01" defaultValue={participant.assessment_score ?? ''} /></label><Button className="button-small" type="submit">Save outcome</Button></form></details> : null}
                        {session.status === 'completed' && participant.certificate_status === 'eligible' ? <form action={issueCertificateAction}><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="participant_id" value={participant.id} /><Button className="button-small" type="submit">Issue certificate</Button></form> : null}
                        {profile.role === 'administrator' && participant.certificate_status === 'issued' ? <details><summary>Revoke certificate</summary><form action={revokeCertificateAction} className="action-form"><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="participant_id" value={participant.id} /><label className="field"><span>Reason</span><input name="reason" minLength={5} required /></label><Button className="button-small" type="submit">Revoke</Button></form></details> : null}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          {canManage && ['scheduled', 'open'].includes(session.status) ? (
            <section className="workspace-section" aria-labelledby="register-title">
              <div className="section-heading"><div><h2 id="register-title">Add participant</h2><p>When all seats are occupied, the database creates a waitlisted registration.</p></div></div>
              <form action={registerParticipantAction} className="workflow-form"><input type="hidden" name="session_id" value={session.id} /><div className="field-grid"><label className="field"><span>Full name</span><input name="full_name" required minLength={2} maxLength={160} /></label><label className="field"><span>Employee reference</span><input name="employee_reference" maxLength={80} /></label><label className="field"><span>Email</span><input name="email" type="email" maxLength={254} /></label><label className="field"><span>Phone</span><input name="phone" maxLength={40} /></label></div><Button type="submit">Add to roster</Button></form>
            </section>
          ) : null}
        </div>

        {canManage ? (
          <aside className="action-panel" aria-labelledby="control-title">
            <h2 id="control-title">Session controls</h2>
            <p className="action-note">Lifecycle changes are validated and written to the audit trail.</p>
            {session.status === 'scheduled' ? <form action={transitionSessionAction}><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="transition" value="open" /><Button type="submit">Open registration</Button></form> : null}
            {['scheduled', 'open'].includes(session.status) ? <form action={transitionSessionAction}><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="transition" value="start" /><Button type="submit">Start session</Button></form> : null}
            {session.status === 'in_progress' ? <form action={transitionSessionAction}><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="transition" value="complete" /><Button type="submit">Complete session</Button><p className="action-note">Requires final outcomes for every active participant.</p></form> : null}
            {['scheduled', 'open'].includes(session.status) ? <details><summary>Change schedule</summary><form action={rescheduleSessionAction} className="action-form"><input type="hidden" name="session_id" value={session.id} /><label className="field"><span>Trainer</span><select name="trainer_id" required defaultValue={session.trainer_id}>{workspace.trainers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Venue</span><select name="venue_id" required defaultValue={session.venue_id}>{workspace.venues.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Starts</span><input name="starts_at" type="datetime-local" required defaultValue={dateTimeLocal(session.starts_at)} /></label><label className="field"><span>Ends</span><input name="ends_at" type="datetime-local" required defaultValue={dateTimeLocal(session.ends_at)} /></label><label className="field"><span>Capacity</span><input name="capacity" type="number" min="1" required defaultValue={session.capacity} /></label><label className="field"><span>Notes</span><textarea name="notes" rows={3} maxLength={2000} defaultValue={session.notes ?? ''} /></label><Button type="submit">Validate and save</Button></form></details> : null}
            {['scheduled', 'open', 'in_progress'].includes(session.status) ? <details><summary>Cancel session</summary><form action={transitionSessionAction} className="action-form"><input type="hidden" name="session_id" value={session.id} /><input type="hidden" name="transition" value="cancel" /><label className="field"><span>Reason</span><textarea name="reason" minLength={5} required rows={3} /></label><Button type="submit">Cancel session</Button></form></details> : null}
          </aside>
        ) : <aside className="action-panel"><h2>Read-only view</h2><p className="action-note">Your role can inspect delivery and participant evidence but cannot change it.</p></aside>}
      </div>
    </AppShell>
  )
}
