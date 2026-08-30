import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import { createCatalogueSessionAction, createSessionAction } from '@/features/delivery/actions'
import { currentManilaDate, isDateKey, type CalendarView } from '@/features/delivery/calendar'
import { DeliveryCalendar } from '@/features/delivery/DeliveryCalendar'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { hasIncompleteOutcome } from '@/features/delivery/rules'
import type { SessionStatus } from '@/features/delivery/types'
import { displayNumber } from '@/features/sales/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageDelivery, canViewDelivery } from '@/lib/permissions'

export default async function TrainingDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ message?: string; error?: string; view?: string; date?: string; trainer?: string; venue?: string; status?: string; category?: string; course?: string; offering?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewDelivery(profile.role)) redirect('/')

  const [workspace, notice] = await Promise.all([getDeliveryWorkspace(), searchParams])
  const canManage = canManageDelivery(profile.role)
  const sessions = [...workspace.sessions].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
  const today = currentManilaDate()
  const view: CalendarView = ['month', 'week', 'list'].includes(notice.view ?? '') ? notice.view as CalendarView : 'month'
  const anchorDate = isDateKey(notice.date) ? notice.date : today
  const trainerId = workspace.trainers.some((item) => item.id === notice.trainer) ? notice.trainer ?? '' : ''
  const venueId = workspace.venues.some((item) => item.id === notice.venue) ? notice.venue ?? '' : ''
  const status: SessionStatus | '' = ['scheduled', 'open', 'in_progress', 'completed', 'cancelled'].includes(notice.status ?? '') ? notice.status as SessionStatus : ''
  const categoryId = workspace.categories.some((item) => item.id === notice.category) ? notice.category ?? '' : ''
  const courseId = workspace.courses.some((item) => item.id === notice.course) ? notice.course ?? '' : ''
  const offeringType = ['public', 'private', 'internal'].includes(notice.offering ?? '') ? notice.offering as 'public' | 'private' | 'internal' : ''
  const calendarSessions = sessions.filter((session) => {
    const course = workspace.courses.find((item) => item.id === session.course_id)
    return (!trainerId || session.trainer_id === trainerId)
      && (!venueId || session.venue_id === venueId)
      && (!status || session.status === status)
      && (!categoryId || course?.category_id === categoryId)
      && (!courseId || session.course_id === courseId)
      && (!offeringType || session.offering_type === offeringType)
  })
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
  const ownerName = new Map(workspace.profiles.map((item) => [item.id, item.full_name]))

  return (
    <AppShell profile={profile} active="training">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Training delivery</p>
          <h1>Session calendar and control desk</h1>
          <p>{canManage ? 'Schedule accepted orders, prevent resource conflicts, and move each delivery through a controlled lifecycle.' : 'Read-only delivery visibility is scoped to the work your role is allowed to see.'}</p>
        </div>
        <div className="heading-actions"><Link prefetch={false} className="button button-secondary" href="/api/exports/sessions">Export sessions</Link><div className="summary-chip">Calendar · {upcoming.length} upcoming</div></div>
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
        <DeliveryCalendar workspace={workspace} sessions={calendarSessions} view={view} anchorDate={anchorDate} today={today} filters={{ trainerId, venueId, status, categoryId, courseId, offeringType }} />
      </section>

      {canManage ? (
        <section className="workspace-section" aria-labelledby="catalogue-session-title">
          <div className="section-heading"><div><h2 id="catalogue-session-title">Create public or internal session inventory</h2><p>Start from the calendar, use configurable minimum participants, then publish public inventory for Sales selection.</p></div></div>
          <form action={createCatalogueSessionAction} className="workflow-form">
            <div className="field-grid field-grid-three">
              <label className="field"><span>Offering</span><select name="offering_type"><option value="public">Public / sellable</option><option value="internal">Internal academy use</option></select></label>
              <label className="field"><span>Course</span><select name="course_id" required defaultValue=""><option value="" disabled>Select course</option>{workspace.courses.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.title}</option>)}</select></label>
              <label className="field"><span>Delivery type</span><select name="learning_type"><option value="classroom">Classroom</option><option value="virtual">Virtual</option><option value="onsite">Onsite</option></select></label>
              <label className="field"><span>Qualified trainer</span><select name="trainer_id" required defaultValue=""><option value="" disabled>Select trainer</option>{workspace.trainers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
              <label className="field"><span>Venue</span><select name="venue_id" required defaultValue=""><option value="" disabled>Select venue</option>{workspace.venues.map((item) => <option value={item.id} key={item.id}>{item.name} · {item.venue_type}</option>)}</select></label>
              <label className="field"><span>Room <small>optional; physical only</small></span><select name="room_id" defaultValue=""><option value="">Venue-wide booking</option>{workspace.rooms.map((item) => <option value={item.id} key={item.id}>{workspace.venues.find((venue) => venue.id === item.venue_id)?.name} · {item.name} · max {item.capacity}</option>)}</select></label>
              <label className="field"><span>Capacity</span><input name="capacity" type="number" min="1" required /></label>
              <label className="field"><span>Minimum participants</span><input name="minimum_participants" type="number" min="1" defaultValue="8" required /></label>
              <label className="field"><span>Starts (Manila time)</span><input name="starts_at" type="datetime-local" required /></label>
              <label className="field"><span>Ends (Manila time)</span><input name="ends_at" type="datetime-local" required /></label>
              <label className="field field-wide"><span>Delivery notes</span><textarea name="notes" rows={3} maxLength={2000} placeholder="Session purpose, joining instructions, or internal brief" /></label>
            </div>
            <p className="form-help">The database checks qualification, trainer availability, room/venue capacity, and overlapping schedule blocks before saving.</p>
            <Button type="submit">Create draft session</Button>
          </form>
        </section>
      ) : null}

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
