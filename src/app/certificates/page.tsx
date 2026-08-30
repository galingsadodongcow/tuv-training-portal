import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displaySessionNumber } from '@/features/delivery/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewDelivery } from '@/lib/permissions'

export default async function CertificatesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewDelivery(profile.role)) redirect('/')
  const [workspace, query] = await Promise.all([getDeliveryWorkspace(), searchParams])
  const sessions = new Map(workspace.sessions.map((item) => [item.id, item]))
  const courses = new Map(workspace.courses.map((item) => [item.id, item]))
  const customers = new Map(workspace.customers.map((item) => [item.id, item]))
  const search = query.q?.trim().toLowerCase() ?? ''
  const status = query.status ?? ''
  const all = workspace.participants.filter((item) => ['eligible', 'issued', 'revoked'].includes(item.certificate_status))
  const records = all.filter((item) => {
    const session = sessions.get(item.session_id)
    const course = courses.get(session?.course_id ?? '')
    const haystack = [item.full_name, item.certificate_number, course?.code, course?.title].filter(Boolean).join(' ').toLowerCase()
    return (!search || haystack.includes(search)) && (!status || item.certificate_status === status)
  })
  return <AppShell profile={profile} active="participants">
    <div className="breadcrumb"><Link href="/participants">Participants</Link><span>/</span><span>Certificates</span></div>
    <div className="page-heading"><div><p className="eyebrow">Certificate documents & compliance</p><h1>Certificate register</h1><p>Issue status, controlled PDF documents, and revocation evidence remain tied to the participant’s delivery record.</p></div><a className="button button-secondary" href="/api/exports/certificates">Export register</a></div>
    <section className="metric-grid"><MetricCard label="Eligible" value={all.filter((item) => item.certificate_status === 'eligible').length} detail="Ready for operations issuance" /><MetricCard label="Issued" value={all.filter((item) => item.certificate_status === 'issued').length} detail="Controlled documents available" /><MetricCard label="Revoked" value={all.filter((item) => item.certificate_status === 'revoked').length} detail="Retained for audit evidence" /><MetricCard label="Total register" value={all.length} detail="Eligible and historical records" /></section>
    <section className="workspace-section"><div className="section-heading"><div><h2>Visible certificate records</h2><p>The same database scope and personal-data masking used by participant operations applies here.</p></div></div>
      <form className="search-form" action="/certificates"><label className="field"><span>Search</span><input name="q" defaultValue={query.q ?? ''} placeholder="Participant, certificate, course" /></label><label className="field"><span>Status</span><select name="status" defaultValue={status}><option value="">All statuses</option><option value="eligible">Eligible</option><option value="issued">Issued</option><option value="revoked">Revoked</option></select></label><button className="button button-secondary">Filter</button></form>
      {records.length === 0 ? <EmptyState>No certificates match this view.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Certificate</th><th>Participant</th><th>Course</th><th>Session</th><th>Issued</th><th>Status</th></tr></thead><tbody>{records.map((item) => { const session = sessions.get(item.session_id); const course = courses.get(session?.course_id ?? ''); const customer = customers.get(item.customer_id); return <tr key={item.id}><td>{item.certificate_number ? <Link className="table-link code" href={`/certificates/${item.id}`}>{item.certificate_number}</Link> : <span className="muted">Pending issuance</span>}</td><td className="cell-strong">{item.full_name}<span className="cell-subtitle">{customer?.name}</span></td><td>{course?.code}<span className="cell-subtitle">{course?.title}</span></td><td>{session ? <Link className="table-link" href={`/training/sessions/${session.id}`}>{displaySessionNumber(session.session_number)}</Link> : '—'}</td><td>{item.certificate_issued_at ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(item.certificate_issued_at)) : '—'}</td><td><span className={`workflow-status status-${item.certificate_status}`}>{item.certificate_status}</span></td></tr>})}</tbody></table></div>}
    </section>
  </AppShell>
}
