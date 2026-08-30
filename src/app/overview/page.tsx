import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import { getRecentAuditEvents } from '@/features/access/queries'
import { isDateKey } from '@/features/delivery/calendar'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displaySessionNumber, formatSessionDate } from '@/features/delivery/rules'
import { buildManagementReport, buildSimulationReport } from '@/features/reporting/derive'
import { DeliveryVolumeChart, OutcomeChart, PipelineChart } from '@/features/reporting/ReportCharts'
import type { ReportingFilters, ReportingMode } from '@/features/reporting/types'
import { getCommercialWorkspace } from '@/features/sales/queries'
import { getTrainingCatalogue } from '@/features/training/queries'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewReporting } from '@/lib/permissions'

const dateTime = (value: string) => new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
}).format(new Date(value))

function formatPercent(value: number | string): string {
  return typeof value === 'number'
    ? new Intl.NumberFormat('en-PH', { style: 'percent', maximumFractionDigits: 0 }).format(value)
    : value
}

function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
    notation: value >= 1_000_000 ? 'compact' : 'standard',
  }).format(value)
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string
    from?: string
    to?: string
    customer?: string
    course?: string
    trainer?: string
    venue?: string
    currency?: string
  }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewReporting(profile)) redirect('/')

  const [catalogue, commercial, delivery, query, auditEvents] = await Promise.all([
    getTrainingCatalogue(),
    getCommercialWorkspace(),
    getDeliveryWorkspace(),
    searchParams,
    profile.role === 'administrator' || profile.role === 'auditor' ? getRecentAuditEvents() : Promise.resolve([]),
  ])
  const mode: ReportingMode = query.mode === 'simulation' ? 'simulation' : 'live'
  const availableCurrencies = Array.from(new Set(commercial.orderLines.map((line) => line.currency))).sort()
  const filters: ReportingFilters = {
    from: isDateKey(query.from) ? query.from : '',
    to: isDateKey(query.to) ? query.to : '',
    customerId: commercial.customers.some((item) => item.id === query.customer) ? query.customer ?? '' : '',
    courseId: delivery.courses.some((item) => item.id === query.course) ? query.course ?? '' : '',
    trainerId: delivery.trainers.some((item) => item.id === query.trainer) ? query.trainer ?? '' : '',
    venueId: delivery.venues.some((item) => item.id === query.venue) ? query.venue ?? '' : '',
    currency: availableCurrencies.includes(query.currency ?? '') ? query.currency ?? '' : '',
  }
  const report = mode === 'simulation'
    ? buildSimulationReport()
    : buildManagementReport(commercial, delivery, filters)
  const generatedAt = dateTime(new Date().toISOString())
  const isAuditor = profile.role === 'auditor'
  const money = (value: number) => formatMoney(value, report.currency)

  return (
    <AppShell profile={profile} active="overview">
      <div className="page-heading report-heading">
        <div>
          <p className="eyebrow">{isAuditor ? 'Governance and reporting' : 'Management reporting'}</p>
          <h1>Academy performance</h1>
          <p>Monitor commercial flow, delivery capacity, participant outcomes, and operational follow-up from one read-only workspace.</p>
        </div>
        <nav className="report-mode-switch" aria-label="Reporting data mode">
          <Link href="/overview?mode=live" className={mode === 'live' ? 'active' : ''} aria-current={mode === 'live' ? 'page' : undefined}>Live data</Link>
          <Link href="/overview?mode=simulation" className={mode === 'simulation' ? 'active' : ''} aria-current={mode === 'simulation' ? 'page' : undefined}>Simulation</Link>
        </nav>
      </div>

      <div className={`report-scope-banner ${mode === 'simulation' ? 'report-scope-simulation' : ''}`}>
        <div>
          <strong>{mode === 'simulation' ? 'Simulation scenario' : 'Live Supabase data'}</strong>
          <span>{mode === 'simulation' ? 'Synthetic six-month scenario for safely testing dashboard behavior. No database records are changed.' : `Role-scoped portal records, refreshed when this page loaded at ${generatedAt}.`}</span>
        </div>
        <span>No emails, reminders, or notifications are sent.</span>
      </div>

      {mode === 'live' ? (
        <form className="report-filters" method="get">
          <input type="hidden" name="mode" value="live" />
          <label className="field"><span>From</span><input type="date" name="from" defaultValue={filters.from} /></label>
          <label className="field"><span>To</span><input type="date" name="to" defaultValue={filters.to} /></label>
          <label className="field"><span>Customer</span><select name="customer" defaultValue={filters.customerId}><option value="">All customers</option>{commercial.customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span>Course</span><select name="course" defaultValue={filters.courseId}><option value="">All courses</option>{delivery.courses.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.title}</option>)}</select></label>
          <label className="field"><span>Trainer</span><select name="trainer" defaultValue={filters.trainerId}><option value="">All trainers</option>{delivery.trainers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label className="field"><span>Venue</span><select name="venue" defaultValue={filters.venueId}><option value="">All venues</option>{delivery.venues.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          {availableCurrencies.length > 1 ? <label className="field"><span>Currency</span><select name="currency" defaultValue={report.currency}>{availableCurrencies.map((item) => <option value={item} key={item}>{item}</option>)}</select></label> : null}
          <div className="report-filter-actions"><button className="button" type="submit">Apply filters</button><Link className="button button-quiet" href="/overview?mode=live">Reset</Link></div>
        </form>
      ) : null}

      <section className="metric-grid report-metric-grid" aria-label="Management performance indicators">
        {report.metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            label={metric.label}
            value={metric.format === 'currency' && typeof metric.value === 'number' ? money(metric.value) : metric.format === 'percent' ? formatPercent(metric.value) : metric.value}
            detail={metric.detail}
          />
        ))}
      </section>

      <section className="report-chart-grid" aria-label="Performance charts">
        <article className="workspace-section report-panel">
          <div className="section-heading"><div><h2>Delivery volume</h2><p>Enrolled participants against available capacity by session month.</p></div></div>
          {report.monthlyDelivery.length ? <><div className="report-chart-legend"><span><i className="report-legend-enrolled" />Enrolled</span><span><i className="report-legend-capacity" />Capacity</span></div><DeliveryVolumeChart points={report.monthlyDelivery} /></> : <EmptyState>No session activity is available for this scope.</EmptyState>}
        </article>
        <article className="workspace-section report-panel">
          <div className="section-heading"><div><h2>Order pipeline</h2><p>Current order volume and value by workflow status.</p></div></div>
          {report.pipeline.length ? <PipelineChart points={report.pipeline} formatCurrency={money} /> : <EmptyState>No orders are available for this scope.</EmptyState>}
        </article>
        <article className="workspace-section report-panel">
          <div className="section-heading"><div><h2>Participant outcomes</h2><p>Finalization, waitlist pressure, and certificate issuance.</p></div></div>
          <OutcomeChart points={report.outcomes} />
        </article>
        <article className="workspace-section report-panel report-source-panel">
          <div className="section-heading"><div><h2>Reporting coverage</h2><p>Records included after role scope and selected filters.</p></div></div>
          <dl className="report-coverage-grid"><div><dt>Inquiries</dt><dd>{report.sourceCounts.inquiries}</dd></div><div><dt>Orders</dt><dd>{report.sourceCounts.orders}</dd></div><div><dt>Sessions</dt><dd>{report.sourceCounts.sessions}</dd></div><div><dt>Participants</dt><dd>{report.sourceCounts.participants}</dd></div></dl>
          <p className="action-note">{mode === 'simulation' ? 'Fixture-only values are intentionally isolated from live portal records.' : 'Commercial dates use record creation; delivery dates use the session start in Asia/Manila.'}</p>
        </article>
      </section>

      <section className="workspace-section" aria-labelledby="course-performance-title">
        <div className="section-heading"><div><h2 id="course-performance-title">Course performance</h2><p>Volume, seat usage, outcome closure, and certificates by course.</p></div></div>
        {report.courses.length ? <div className="table-wrap"><table><thead><tr><th>Course</th><th>Sessions</th><th>Enrollment</th><th>Utilization</th><th>Outcomes complete</th><th>Certificates</th></tr></thead><tbody>{report.courses.map((row) => <tr key={row.id}><td><span className="code">{row.code}</span><span className="cell-title">{row.title}</span></td><td>{row.sessions}</td><td>{row.enrolled}/{row.capacity}</td><td>{row.utilization === null ? '—' : formatPercent(row.utilization)}</td><td>{row.completedOutcomes}</td><td>{row.certificates}</td></tr>)}</tbody></table></div> : <EmptyState>No course delivery activity is available.</EmptyState>}
      </section>

      <section className="report-detail-grid">
        <article className="workspace-section">
          <div className="section-heading"><div><h2>Trainer utilization</h2><p>Assigned delivery hours and roster demand.</p></div></div>
          {report.trainers.length ? <div className="table-wrap"><table><thead><tr><th>Trainer</th><th>Sessions</th><th>Hours</th><th>Enrolled</th><th>Waiting</th></tr></thead><tbody>{report.trainers.map((row) => <tr key={row.id}><td className="cell-strong">{row.name}</td><td>{row.sessions}</td><td>{row.deliveryHours.toFixed(1)}</td><td>{row.enrolled}</td><td>{row.waitlisted}</td></tr>)}</tbody></table></div> : <EmptyState>No trainer activity is available.</EmptyState>}
        </article>
        <article className="workspace-section">
          <div className="section-heading"><div><h2>Operational follow-up</h2><p>Full, waitlisted, or outcome-incomplete sessions requiring attention.</p></div></div>
          {report.followUps.length ? <div className="report-follow-up-list">{report.followUps.map((item) => {
            const content = <><div><span className="code">{displaySessionNumber(item.sessionNumber)}</span><strong>{item.course}</strong><span>{formatSessionDate(item.startsAt)} · {item.enrolled}/{item.capacity} seats</span></div><div><span className={`workflow-status status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span><span>{item.waitlisted ? `${item.waitlisted} waiting` : `${item.pendingOutcomes} outcomes pending`}</span></div></>
            return mode === 'live' ? <Link className="report-follow-up" href={`/training/sessions/${item.id}`} key={item.id}>{content}</Link> : <div className="report-follow-up" key={item.id}>{content}</div>
          })}</div> : <EmptyState>No sessions currently need reporting follow-up.</EmptyState>}
        </article>
      </section>

      {(profile.role === 'administrator' || isAuditor) && mode === 'live' ? (
        <section className="workspace-section" aria-labelledby="audit-title">
          <div className="section-heading"><div><h2 id="audit-title">Recent material activity</h2><p>Read-only evidence from the immutable audit trail.</p></div></div>
          {auditEvents.length === 0 ? <EmptyState>No audit events are available.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>When</th><th>Action</th><th>Entity</th><th>Reason</th></tr></thead><tbody>{auditEvents.map((event) => <tr key={event.id}><td>{dateTime(event.occurred_at)}</td><td className="code">{event.action}</td><td>{event.entity_type} · {event.entity_id}</td><td>{event.reason ?? '—'}</td></tr>)}</tbody></table></div>}
        </section>
      ) : null}

      <details className="report-definitions"><summary>Metric definitions and source notes</summary><div><p><strong>Committed value</strong> sums participant count × unit price for Pending Operations, With Operations, Fulfillment, and Completed orders in the selected currency.</p><p><strong>Seat utilization</strong> divides enrolled, confirmed, completed, and no-show participants by non-cancelled session capacity.</p><p><strong>Outcome completion</strong> requires both attendance and assessment to be finalized for enrolled participants.</p><p><strong>Inquiry conversion</strong> divides Won inquiries by all closed Won or Lost inquiries.</p><p>Live values are calculated server-side from role-scoped Supabase tables. The catalogue currently contains {catalogue.courses.length} visible courses.</p></div></details>
    </AppShell>
  )
}
