import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { getAuditWorkspace } from '@/features/audit/queries'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewAudit } from '@/lib/permissions'

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active || !canViewAudit(profile.role)) redirect('/')
  const filters = await searchParams
  const workspace = await getAuditWorkspace(filters)
  const actorName = new Map(workspace.profiles.map((item) => [item.id, item.full_name]))
  const entities = Array.from(new Set(workspace.events.map((item) => item.entity_type))).sort()

  return (
    <AppShell profile={profile} active="audit">
      <div className="page-heading"><div><p className="eyebrow">Oversight</p><h1>Immutable audit trail</h1><p>Review access changes, assignments, lifecycle transitions, schedule changes, reservations, and controlled cancellations.</p></div><div className="summary-chip">Latest {workspace.events.length} events</div></div>
      <section className="workspace-section" aria-labelledby="audit-events-title">
        <div className="section-heading"><div><h2 id="audit-events-title">Audit events</h2><p>Filters are URL-backed so an oversight view can be shared and revisited.</p></div></div>
        <form method="get" className="search-form">
          <label className="field"><span>Action contains</span><input name="action" defaultValue={filters.action ?? ''} placeholder="session, order, access…" /></label>
          <label className="field"><span>Entity</span><select name="entity" defaultValue={filters.entity ?? ''}><option value="">All entities</option>{entities.map((entity) => <option value={entity} key={entity}>{entity}</option>)}</select></label>
          <button className="button button-secondary" type="submit">Apply</button>
          <Link className="button button-quiet" href="/audit">Clear</Link>
        </form>
        {workspace.events.length === 0 ? <EmptyState>No audit events match these filters.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>Reason</th><th>Evidence</th></tr></thead><tbody>{workspace.events.map((event) => <tr key={event.id}><td>{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' }).format(new Date(event.occurred_at))}</td><td>{event.actor_id ? actorName.get(event.actor_id) ?? 'Inactive user' : 'System'}</td><td><span className="code">{event.action}</span></td><td>{event.entity_type}<span className="cell-subtitle">{event.entity_id}</span></td><td>{event.reason ?? '—'}</td><td><code className="audit-details">{JSON.stringify(event.details)}</code></td></tr>)}</tbody></table></div>}
      </section>
    </AppShell>
  )
}
