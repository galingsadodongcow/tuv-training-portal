import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { capabilitiesForProfile, navigationForProfile } from '@/lib/permissions'
import { getCurrentProfile } from '@/lib/auth/profile'
import { ROLES, type Profile, type Role } from '@/types/auth'

export default async function RolePreviewPage({ searchParams }: { searchParams: Promise<{ role?: string; sales_scope?: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (profile.role !== 'administrator') redirect('/administration')
  const query = await searchParams
  const role: Role = ROLES.includes(query.role as Role) ? query.role as Role : 'operations'
  const isSupervisor = role === 'sales' && query.sales_scope === 'supervisor'
  const preview: Profile = { id: 'role-preview', full_name: isSupervisor ? 'Sales supervisor preview' : `${role} preview`, role, is_active: true, is_sales_supervisor: isSupervisor }
  const navigation = navigationForProfile(preview)
  const capabilities = capabilitiesForProfile(preview)
  return <AppShell profile={profile} active="administration">
    <div className="breadcrumb"><Link href="/administration">Administration</Link><span>/</span><span>Role preview</span></div>
    <div className="page-heading"><div><p className="eyebrow">Safe workflow simulation</p><h1>Preview role access</h1><p>Inspect the navigation and workflow authority a role receives without impersonating a user or bypassing Supabase security.</p></div><div className="summary-chip capitalize">{isSupervisor ? 'Sales supervisor' : role}</div></div>
    <div className="report-scope-banner report-scope-simulation"><div><strong>Simulation only</strong><span>This preview does not change an account, session, or database scope. Live requests are still authenticated and checked by Supabase RLS and workflow functions.</span></div><span>No data changes</span></div>
    <section className="workspace-section"><form className="role-preview-form" action="/administration/role-preview"><label className="field"><span>Role</span><select name="role" defaultValue={role}>{ROLES.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select></label><label className="field"><span>Sales scope</span><select name="sales_scope" defaultValue={isSupervisor ? 'supervisor' : 'individual'}><option value="individual">Individual scope</option><option value="supervisor">Supervisor scope</option></select></label><button className="button button-secondary">Apply preview</button></form></section>
    <div className="role-preview-grid"><section className="workspace-section"><div className="section-heading"><div><h2>Navigation preview</h2><p>Items this role sees after sign-in.</p></div></div><ol className="preview-navigation">{navigation.map((item) => <li key={`${item.href}-${item.label}`}><span>{item.label}</span><code>{item.href}</code></li>)}</ol></section><section className="workspace-section"><div className="section-heading"><div><h2>Workflow authority</h2><p>Frontend controls mirror these permissions; the backend re-checks every write.</p></div></div><div className="capability-list">{capabilities.map((item) => <article key={item.area}><div><strong>{item.area}</strong><p>{item.detail}</p></div><span className={`workflow-status status-${item.access === 'none' ? 'cancelled' : item.access === 'view' ? 'scheduled' : 'completed'}`}>{item.access}</span></article>)}</div></section></div>
  </AppShell>
}
