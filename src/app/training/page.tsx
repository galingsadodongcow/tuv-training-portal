import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import { createSessionAction } from '@/features/delivery/actions'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displaySessionNumber, formatSessionDate, formatSessionTime, hasIncompleteOutcome, sessionSeatSummary } from '@/features/delivery/rules'
import { displayNumber } from '@/features/sales/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageDelivery, canViewDelivery } from '@/lib/permissions'

export default async function TrainingDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewDelivery(profile.role)) redirect('/')

  const [workspace, notice] = await Promise.all([getDeliveryWorkspace(), searchParams])
  const canManage = canManageDelivery(profile.role)
  const sessions = [...workspace.sessions].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const upcoming = sessions.filter((item) => ['scheduled', 'open'].includes(item.status))
  const inProgress = sessions.filter((item) => item.status === 'in_progress')
  const waitlisted = workspace.participants.filter((item) => item.status === 'waitlisted').length
  const incomplete = workspace.participants.filter(hasIncompleteOutcome).length
  const sessionLineIds = new Set(workspace.sessions.map((item) => item.order_line_id))
  const schedulableLines = workspace.orderLines.filter((line) => {
    const order = workspace.orders.find((item) => item.id === line.order_id)
    return order && ['with_operations', 'fulfillment'].includes(order.status) && !sessionLineIds.has(line.id)
  })
  const orderById = new Map(workspace.orders.map((item) => [item.id, item]))
  const customerName = new Map(workspace.customers.map((item) => [item.id, item.name]))
  const courseById = new Map(workspace.courses.map((item) => [item.id, item]))
  const trainerName = new Map(workspace.trainers.map((item) => [item.id, item.name]))
  const venueName = new Map(workspace.venues.map((item) => [item.id, item.name]))
  const ownerName = new Map(workspace.profiles.map((item) => [item.id, item.full_name]))

  return (
    <AppShell profile={profile} active="training">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Training delivery</p>
          <h1>Session calendar and control desk</h1>
          <p>{canManage ? 'Schedule accepted orders, prevent resource conflicts, and move each delivery through a controlled lifecycle.' : 'Read-only delivery visibility is scoped to the work your role is allowed to see.'}</p>
        </div>
        <div className="summary-chip">{upcoming.length} upcoming</div>
      </div>
      {notice.message ? <div className="alert alert-success" role="status">{notice.message}</div> : null}
      {notice.error ? <div className="alert alert-error" role="alert">{notice.error}</div> : null}

      <section className="metric-grid" aria-label="Delivery summary">
        <MetricCard label="Upcoming" value={upcoming.length} detail="Scheduled or open" />
        <MetricCard label="In progress" value={inProgress.length} detail="Attendance can be recorded" />
        <MetricCard label="Waitlisted" value={waitlisted} detail="Across visible sessions" />
        <MetricCard label="Outcome queue" value={incomplete} detail="Active participants awaiting final results" />
      </section>

      <section className="workspace-section" aria-labelledby="calendar-title">
        <div className="section-heading"><div><h2 id="calendar-title">Delivery calendar</h2><p>Dates and times are shown in Asia/Manila. Trainer and venue overlaps are blocked in the database.</p></div></div>
        {sessions.length === 0 ? <EmptyState>No sessions are visible yet.</EmptyState> : (
          <div className="session-grid">
            {sessions.map((session) => {
              const seats = sessionSeatSummary(session, workspace.participants)
              const order = orderById.get(session.order_id)
              const course = courseById.get(session.course_id)
              return (
                <Link className="session-card" href={`/training/sessions/${session.id}`} key={session.id}>
                  <div className="session-card-top"><span className="code">{displaySessionNumber(session.session_number)}</span><span className={`workflow-status status-${session.status}`}>{session.status.replaceAll('_', ' ')}</span></div>
                  <strong>{course?.title ?? 'Course unavailable'}</strong>
                  <span>{formatSessionDate(session.starts_at)} · {formatSessionTime(session.starts_at)}–{formatSessionTime(session.ends_at)}</span>
                  <span>{trainerName.get(session.trainer_id)} · {venueName.get(session.venue_id)}</span>
                  <div className="session-card-footer"><span>{seats.occupied}/{session.capacity} seats</span><span>{seats.waitlisted ? `${seats.waitlisted} waitlisted` : customerName.get(order?.customer_id ?? '')}</span></div>
                </Link>
              )
            })}
          </div>
        )}
      </section>

      {canManage ? (
        <section className="workspace-section" aria-labelledby="schedule-title">
          <div className="section-heading"><div><h2 id="schedule-title">Schedule an accepted order line</h2><p>Scheduling starts fulfillment automatically. Course and delivery type remain locked to the commercial agreement.</p></div></div>
          {schedulableLines.length === 0 ? (
            <EmptyState>No accepted order lines are waiting for scheduling. Review the <Link className="table-link" href="/my-work">Operations handoff queue</Link>.</EmptyState>
          ) : (
            <form action={createSessionAction} className="workflow-form">
              <div className="field-grid field-grid-three">
                <label className="field field-wide"><span>Accepted order line</span><select name="order_line_id" required defaultValue=""><option value="" disabled>Select an order line</option>{schedulableLines.map((line) => { const order = orderById.get(line.order_id); const course = courseById.get(line.course_id); return <option value={line.id} key={line.id}>{displayNumber('ORD', order?.order_number ?? 0)} · {customerName.get(order?.customer_id ?? '')} · {course?.code} · {line.learning_type} · {line.participant_count} participants</option> })}</select></label>
                <label className="field"><span>Qualified trainer</span><select name="trainer_id" required defaultValue=""><option value="" disabled>Select trainer</option>{workspace.trainers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
                <label className="field"><span>Venue</span><select name="venue_id" required defaultValue=""><option value="" disabled>Select venue</option>{workspace.venues.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.venue_type}{item.capacity ? ` · max ${item.capacity}` : ''}</option>)}</select></label>
                <label className="field"><span>Capacity</span><input name="capacity" type="number" min="1" required /></label>
                <label className="field"><span>Starts (Manila time)</span><input name="starts_at" type="datetime-local" required /></label>
                <label className="field"><span>Ends (Manila time)</span><input name="ends_at" type="datetime-local" required /></label>
                <label className="field field-wide"><span>Delivery notes</span><textarea name="notes" rows={3} maxLength={2000} placeholder="Trainer brief, room instructions, or joining details" /></label>
              </div>
              <p className="form-help">The database verifies trainer qualification, venue type and capacity, ordered headcount, and overlapping bookings before saving.</p>
              <Button type="submit">Schedule session</Button>
            </form>
          )}
        </section>
      ) : null}

      {canManage && workspace.sessions.length ? <p className="muted">Delivery ownership: {ownerName.get(workspace.sessions[0].operations_owner_id) ?? 'Operations'} is shown on each session record.</p> : null}
    </AppShell>
  )
}
