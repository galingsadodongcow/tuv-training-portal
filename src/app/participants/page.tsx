import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displayParticipantNumber, displaySessionNumber } from '@/features/delivery/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageDelivery, canViewDelivery } from '@/lib/permissions'

export default async function ParticipantsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewDelivery(profile.role)) redirect('/')
  const [workspace, query] = await Promise.all([getDeliveryWorkspace(), searchParams])
  const search = query.q?.trim().toLowerCase() ?? ''
  const status = query.status ?? ''
  const sessions = new Map(workspace.sessions.map((item) => [item.id, item]))
  const courseName = new Map(workspace.courses.map((item) => [item.id, `${item.code} · ${item.title}`]))
  const customerName = new Map(workspace.customers.map((item) => [item.id, item.name]))
  const participants = workspace.participants.filter((item) => {
    const matchesSearch = !search || [item.full_name, item.email, item.employee_reference, item.certificate_number].some((value) => value?.toLowerCase().includes(search))
    return matchesSearch && (!status || item.status === status || item.certificate_status === status)
  })
  const active = workspace.participants.filter((item) => ['registered', 'confirmed'].includes(item.status)).length
  const waitlisted = workspace.participants.filter((item) => item.status === 'waitlisted').length
  const completed = workspace.participants.filter((item) => item.status === 'completed').length
  const issued = workspace.participants.filter((item) => item.certificate_status === 'issued').length

  return (
    <AppShell profile={profile} active="participants">
      <div className="page-heading"><div><p className="eyebrow">Participant operations</p><h1>Participant registry</h1><p>{canManageDelivery(profile.role) ? 'Search every visible registration, then open its session to manage confirmation, waitlists, transfer, outcomes, and certificates.' : 'Read-only participant evidence is limited by your delivery access.'}</p></div><div className="heading-actions"><Link className="button button-secondary" href="/certificates">Certificate register</Link><Link prefetch={false} className="button button-secondary" href="/api/exports/participants">Export CSV</Link><div className="summary-chip">{workspace.participants.length} records</div></div></div>
      <section className="metric-grid" aria-label="Participant summary">
        <MetricCard label="Active seats" value={active} detail="Registered or confirmed" />
        <MetricCard label="Waitlisted" value={waitlisted} detail="Awaiting a released seat" />
        <MetricCard label="Completed" value={completed} detail="Attendance finalized" />
        <MetricCard label="Certificates" value={issued} detail="Issued and auditable" />
      </section>
      <section className="workspace-section" aria-labelledby="registry-title">
        <div className="section-heading"><div><h2 id="registry-title">Visible registrations</h2><p>Personal data is shown only to roles permitted by the session’s order scope.</p></div></div>
        <form className="search-form" action="/participants">
          <label className="field"><span>Search</span><input name="q" defaultValue={query.q ?? ''} placeholder="Name, email, employee ref, certificate" /></label>
          <label className="field"><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="registered">Registered</option><option value="confirmed">Confirmed</option><option value="waitlisted">Waitlisted</option><option value="completed">Completed</option><option value="no_show">No show</option><option value="eligible">Certificate eligible</option><option value="issued">Certificate issued</option></select></label>
          <button className="button button-secondary" type="submit">Filter</button>
        </form>
        {participants.length === 0 ? <EmptyState>No participants match this view.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Participant</th><th>Customer</th><th>Session</th><th>Registration</th><th>Outcome</th><th>Certificate</th></tr></thead><tbody>{participants.map((item) => { const session = sessions.get(item.session_id); return <tr key={item.id}><td><span className="code">{displayParticipantNumber(item.participant_number)}</span><span className="cell-title">{item.full_name}</span><span className="cell-subtitle">{item.email ?? item.employee_reference ?? 'No contact detail'}</span></td><td>{customerName.get(item.customer_id)}</td><td>{session ? <Link className="table-link" href={`/training/sessions/${session.id}`}>{displaySessionNumber(session.session_number)}<span className="cell-subtitle">{courseName.get(session.course_id)}</span></Link> : '—'}</td><td><span className={`workflow-status status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span></td><td><span className={`workflow-status status-${item.attendance_status}`}>{item.attendance_status}</span><span className="cell-subtitle">Assessment: {item.assessment_status.replaceAll('_', ' ')}</span></td><td>{item.certificate_number ? <Link className="table-link code" href={`/certificates/${item.id}`}>{item.certificate_number}</Link> : <span className={`workflow-status status-${item.certificate_status}`}>{item.certificate_status.replaceAll('_', ' ')}</span>}</td></tr> })}</tbody></table></div>}
      </section>
    </AppShell>
  )
}
