import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import { getRecentAuditEvents } from '@/features/access/queries'
import { getCommercialWorkspace } from '@/features/sales/queries'
import { displayNumber } from '@/features/sales/rules'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displaySessionNumber, formatSessionDate, sessionSeatSummary } from '@/features/delivery/rules'
import { getTrainingCatalogue } from '@/features/training/queries'
import { catalogueMetrics, operationsReadiness } from '@/features/workspaces/derive'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewOverview } from '@/lib/permissions'

const dateTime = (value: string) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value))

export default async function OverviewPage() {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewOverview(profile.role)) redirect('/')

  const [catalogue, commercial, delivery, auditEvents] = await Promise.all([
    getTrainingCatalogue(),
    getCommercialWorkspace(),
    getDeliveryWorkspace(),
    profile.role === 'administrator' || profile.role === 'auditor' ? getRecentAuditEvents() : Promise.resolve([]),
  ])
  const metrics = catalogueMetrics(catalogue)
  const readiness = operationsReadiness(catalogue)
  const isAuditor = profile.role === 'auditor'
  const openInquiries = commercial.inquiries.filter((item) => !['won', 'lost'].includes(item.status)).length
  const pendingHandoffs = commercial.orders.filter((item) => item.status === 'pending_operations').length
  const activeOrders = commercial.orders.filter((item) => !['completed', 'cancelled'].includes(item.status)).length
  const customerName = new Map(commercial.customers.map((item) => [item.id, item.name]))
  const deliveryCourse = new Map(delivery.courses.map((item) => [item.id, item.title]))
  const activeSessions = delivery.sessions.filter((item) => ['scheduled', 'open', 'in_progress'].includes(item.status))
  const issuedCertificates = delivery.participants.filter((item) => item.certificate_status === 'issued').length

  return (
    <AppShell profile={profile} active="overview">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{isAuditor ? 'Governance' : 'Management'}</p>
          <h1>{isAuditor ? 'Audit overview' : 'Academy overview'}</h1>
          <p>{isAuditor ? 'Read-only evidence for access and configuration activity.' : 'A calm, read-only view of catalogue and delivery readiness.'}</p>
        </div>
        <div className="summary-chip">{readiness.length ? `${readiness.length} readiness exceptions` : 'Configuration ready'}</div>
      </div>

      <section className="metric-grid" aria-label="Academy business summary">
        <MetricCard label="Open inquiries" value={openInquiries} detail="Commercial pipeline" />
        <MetricCard label="Active orders" value={activeOrders} detail={`${pendingHandoffs} awaiting Operations`} />
        <MetricCard label="Active courses" value={metrics.activeCourses} detail={`${metrics.pricedCourses} with pricing`} />
        <MetricCard label="Active sessions" value={activeSessions.length} detail={`${issuedCertificates} certificates issued`} />
      </section>

      {profile.role === 'administrator' || isAuditor ? (
        <section className="workspace-section" aria-labelledby="audit-title">
          <div className="section-heading">
            <div>
              <h2 id="audit-title">Recent material activity</h2>
              <p>Access changes and seeded configuration evidence from the immutable audit trail.</p>
            </div>
          </div>
          {auditEvents.length === 0 ? <EmptyState>No audit events are available.</EmptyState> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead>
                <tbody>{auditEvents.map((event) => (
                  <tr key={event.id}>
                    <td>{dateTime(event.occurred_at)}</td>
                    <td className="code">{event.action}</td>
                    <td>{event.entity_type} · {event.entity_id}</td>
                    <td>{event.reason ?? '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="workspace-section" aria-labelledby="management-note-title">
          <div className="section-heading">
            <div>
              <h2 id="management-note-title">Management interpretation</h2>
              <p>All figures come directly from the controlled catalogue and resource records.</p>
            </div>
          </div>
          {commercial.orders.length === 0 ? <p className="muted">No order activity is visible.</p> : <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Requested</th><th>Status</th></tr></thead><tbody>{commercial.orders.slice(0, 10).map((order) => <tr key={order.id}><td className="code">{displayNumber('ORD', order.order_number)}</td><td>{customerName.get(order.customer_id)}</td><td>{order.requested_start_date ?? '—'}</td><td><span className={`workflow-status status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table></div>}
        </section>
      )}

      <section className="workspace-section" aria-labelledby="delivery-overview-title">
        <div className="section-heading"><div><h2 id="delivery-overview-title">Training delivery</h2><p>Read-only schedule, capacity, and lifecycle visibility for management and governance.</p></div></div>
        {activeSessions.length === 0 ? <EmptyState>No active training sessions are visible.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Session</th><th>Course</th><th>Date</th><th>Seats</th><th>Status</th></tr></thead><tbody>{activeSessions.slice(0, 10).map((session) => { const seats = sessionSeatSummary(session, delivery.participants); return <tr key={session.id}><td><span className="code">{displaySessionNumber(session.session_number)}</span></td><td>{deliveryCourse.get(session.course_id)}</td><td>{formatSessionDate(session.starts_at)}</td><td>{seats.occupied}/{session.capacity}{seats.waitlisted ? ` · ${seats.waitlisted} waitlisted` : ''}</td><td><span className={`workflow-status status-${session.status}`}>{session.status.replaceAll('_', ' ')}</span></td></tr> })}</tbody></table></div>}
      </section>
    </AppShell>
  )
}
