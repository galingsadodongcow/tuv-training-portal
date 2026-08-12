'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useClient, useClientHistory, useEntityActivity, useAuditTrail, useInvalidate, useOrgOptions, useOrgClients } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { RecordHeader, RecordTabs, RecordSection, KeyVal, Badge } from '../components/record'
import ActivityTimeline from '../components/ActivityTimeline'
import AttachmentsPanel from '../components/AttachmentsPanel'
import ContactsPanel from '../components/ContactsPanel'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { taskEvents, notificationEvents, auditEvents, mergeActivity } from '../lib/activity'
import { php, shortDate } from '../lib/format'
import { formatSegments } from '../lib/labels'
import { collectionState, collectionTone } from '../lib/orderState'

// Customer 360: one page that gathers everything about a client. Contacts,
// orders, the sessions those orders booked, and the money position, all read
// from the order history the client already has.
export default function ClientDetail() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  const tab = search.get('tab') || 'overview'
  const setTab = (t: string) => {
    const n = new URLSearchParams(search.toString())
    if (t === 'overview') n.delete('tab')
    else n.set('tab', t)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidate()
  const [saving, setSaving] = useState(false)
  const [creatingOrg, setCreatingOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const client = useClient(id)
  const orgOptions = useOrgOptions()
  const hist = useClientHistory(id)
  const activity = useEntityActivity('client', id)
  const audit = useAuditTrail('client', id)
  // Sibling accounts under the same organization (the Organizations book folded
  // into the customer record — #6). Disabled until org_id resolves.
  const siblings = useOrgClients((client.data as any)?.org_id)

  if (client.isLoading) return <Spinner label="Loading customer" />
  if (client.error) return <ErrorNote error={client.error} />
  const c: any = client.data
  if (!c) {
    return (
      <>
        <RecordHeader title="Customer not found" back={{ href: '/clients', label: 'Clients' }} />
        <div className="card"><div className="empty">This customer does not exist or you cannot access it.</div></div>
      </>
    )
  }

  // Soft delete: the Archive control only appears once the deleted_at column
  // exists (the record carries the field). It hides the customer from lists
  // without destroying history; Restore clears it.
  const softDeleteReady = c.deleted_at !== undefined
  const archived = !!c.deleted_at
  // Match the database: the super admin, the business owner, or the salesperson
  // who owns this client may archive it.
  const isOwnerSales = profile?.role === 'sales' && !!profile?.sales_id && c.owner_sales_id === profile?.sales_id
  const canArchive = softDeleteReady && (['super_admin', 'business_owner'].includes(profile?.role as string) || isOwnerSales)
  // Setting a client's organization is a client UPDATE. Live RLS (20260812210000)
  // allows super_admin/coordinator/operations/business_owner + the owning sales rep.
  // The org_id field only exists once the S6/customer migrations are applied; hide
  // the control until then.
  const orgReady = c.org_id !== undefined
  const canSetOrg = orgReady && (['super_admin', 'coordinator', 'operations', 'business_owner'].includes(profile?.role as string) || isOwnerSales)
  // Creating a new org (vs. assigning an existing one) keeps the old
  // Organizations-screen gate: super_admin, or the owning sales rep.
  const canCreateOrg = canSetOrg && (profile?.role === 'super_admin' || (profile?.role === 'sales' && isOwnerSales))
  const orgName = (orgOptions.data || []).find((o: any) => o.org_id === c.org_id)?.name
  // Other customers under the same organization (this customer excluded).
  const related = (siblings.data || []).filter((s: any) => s.client_id !== id)

  const setOrg = async (orgId: string | null) => {
    setSaving(true)
    const { error } = await supabase.from('client').update({ org_id: orgId }).eq('client_id', id)
    if (error) toast.error(error.message)
    else { toast.success(orgId ? 'Organization set.' : 'Organization cleared.'); invalidate(['client', 'clients', 'org_summary', 'org_clients']) }
    setSaving(false)
  }

  // Create a new organization and group this customer under it. Org creation
  // folded here from the retired Organizations list; attributes (industry,
  // country, notes) are then editable on the organization record.
  const createOrg = async () => {
    const name = newOrgName.trim()
    if (!name) return
    setSaving(true)
    const { data, error } = await supabase.from('organization').insert({ name }).select('org_id').single()
    if (error) { toast.error(error.message); setSaving(false); return }
    const { error: e2 } = await supabase.from('client').update({ org_id: data.org_id }).eq('client_id', id)
    if (e2) toast.error(e2.message)
    else { toast.success('Organization created.'); invalidate(['client', 'clients', 'org_summary', 'org_clients', 'org_options']) }
    setCreatingOrg(false); setNewOrgName('')
    setSaving(false)
  }

  const setDeleted = async (value: string | null) => {
    setSaving(true)
    const { error } = await supabase.from('client').update({ deleted_at: value }).eq('client_id', id)
    if (error) toast.error(error.message)
    else { toast.success(value ? 'Customer archived.' : 'Customer restored.'); invalidate(['client', 'clients']) }
    setSaving(false)
  }
  const archive = async () => {
    const res = await confirm({
      title: 'Archive this customer?',
      body: 'The customer is hidden from lists but not deleted. History is preserved and it can be restored.',
      confirmLabel: 'Archive', tone: 'danger', reason: 'optional',
    })
    if (res.ok) setDeleted(new Date().toISOString())
  }

  const orders = hist.data || []
  const live = orders.filter((o: any) => o.order_status !== 'Cancelled')
  const spend = live.reduce((n: number, o: any) => n + Number(o.total_amount || 0), 0)
  const seats = live.reduce((n: number, o: any) => n + (o.total_seats || 0), 0)
  const paid = live.filter((o: any) => o.payment_status === 'Paid').reduce((n: number, o: any) => n + Number(o.total_amount || 0), 0)
  const outstanding = spend - paid
  const overdue = live.filter((o: any) => collectionState(o) === 'Overdue')
  const overdueAmt = overdue.reduce((n: number, o: any) => n + Number(o.total_amount || 0), 0)

  // Unique sessions this customer booked, newest first.
  const sessions = (() => {
    const map = new Map<string, any>()
    for (const o of live) {
      for (const l of o.lines || []) {
        if (l.schedule_id && !map.has(l.schedule_id)) {
          map.set(l.schedule_id, { schedule_id: l.schedule_id, course: l.course?.course_name, schedule: l.schedule })
        }
      }
    }
    return [...map.values()].sort((a, b) => +new Date(b.schedule?.start_date || 0) - +new Date(a.schedule?.start_date || 0))
  })()

  const tabs = [
    { key: 'overview', label: 'Overview' },
    { key: 'orders', label: `Orders (${orders.length})` },
    { key: 'contacts', label: 'Contacts' },
    { key: 'files', label: 'Files' },
    { key: 'activity', label: 'Activity' },
  ]

  return (
    <>
      <RecordHeader
        crumbs={[{ href: '/my-work', label: 'My Work' }, { href: '/clients', label: 'Clients' }, { label: c.company || c.name || 'Customer' }]}
        title={c.company || c.name || 'Customer'}
        subtitle={[c.name, c.industry].filter(Boolean).join(' · ') || undefined}
        badges={
          <>
            {c.salesperson?.name ? <Badge tone="info">{c.salesperson.name}</Badge> : <Badge tone="neutral">No owner</Badge>}
            {overdueAmt > 0 && <Badge tone="danger">Overdue {php(overdueAmt)}</Badge>}
            {archived && <Badge tone="neutral">Archived</Badge>}
          </>
        }
        actions={
          canArchive && (archived
            ? <button className="btn btn-ghost btn-sm" onClick={() => setDeleted(null)} disabled={saving}>Restore</button>
            : <button className="btn btn-danger btn-sm" onClick={archive} disabled={saving}>Archive</button>)
        }
      />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14 }}>
          <KeyVal label="Bookings">{live.length}</KeyVal>
          <KeyVal label="Seats">{seats}</KeyVal>
          <KeyVal label="Lifetime value">{php(spend)}</KeyVal>
          <KeyVal label="Collected">{php(paid)}</KeyVal>
          <KeyVal label="Outstanding">
            <span style={{ color: outstanding > 0 ? 'var(--tr-amber)' : undefined }}>{php(outstanding)}</span>
          </KeyVal>
        </div>
      </div>

      <RecordTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
      <>
      <div className="card card-pad">
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <KeyVal label="Contact">{c.contact || c.name || '—'}</KeyVal>
          <KeyVal label="Email">{c.email || '—'}</KeyVal>
          <KeyVal label="Phone">{c.phone || '—'}</KeyVal>
          <KeyVal label="Industry">{c.industry || '—'}</KeyVal>
          {orgReady && (
            <KeyVal label="Organization">
              {canSetOrg ? (
                creatingOrg && canCreateOrg ? (
                  <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input aria-label="New organization name" value={newOrgName} onChange={(e) => setNewOrgName(e.target.value)} placeholder="Organization name" style={{ maxWidth: 170 }} onKeyDown={(e) => e.key === 'Enter' && createOrg()} />
                    <button className="btn btn-sm" disabled={saving || !newOrgName.trim()} onClick={createOrg}>Save</button>
                    <button className="linkbtn" onClick={() => { setCreatingOrg(false); setNewOrgName('') }}>Cancel</button>
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select aria-label="Organization" value={c.org_id || ''} onChange={(e) => setOrg(e.target.value || null)} disabled={saving} style={{ maxWidth: 200 }}>
                      <option value="">None</option>
                      {(orgOptions.data || []).map((o: any) => (<option key={o.org_id} value={o.org_id}>{o.name}</option>))}
                    </select>
                    {canCreateOrg && <button className="linkbtn" onClick={() => setCreatingOrg(true)}>+ New</button>}
                  </span>
                )
              ) : c.org_id ? (
                <Link href={`/organizations/${c.org_id}`}>{orgName || 'Organization'}</Link>
              ) : '—'}
            </KeyVal>
          )}
        </div>
      </div>

      {/* Related accounts — the parent/child grouping folded in from the retired
          Organizations book (#6). Siblings under the same org; the org record
          (kept off-nav) is where members/attributes/files are managed. */}
      {orgReady && c.org_id && (
        <RecordSection title="Related accounts">
          <div className="card">
            <div className="toolbar" style={{ justifyContent: 'space-between', padding: '10px 14px' }}>
              <span className="fill-label">Other customers under {orgName || 'this organization'}</span>
              <Link href={`/organizations/${c.org_id}`} className="btn btn-ghost btn-sm">Manage organization ›</Link>
            </div>
            {siblings.isLoading ? (
              <div style={{ padding: 14 }}><Spinner /></div>
            ) : related.length === 0 ? (
              <div className="empty">No other accounts under this organization yet.</div>
            ) : (
              <table>
                <thead><tr><th>Customer</th><th>Contact</th><th>Owner</th></tr></thead>
                <tbody>
                  {related.map((s: any) => (
                    <tr key={s.client_id}>
                      <td><Link href={`/clients/${s.client_id}`} style={{ fontWeight: 600 }}>{s.company || s.name}</Link></td>
                      <td className="fill-label">{s.contact || '—'}</td>
                      <td className="fill-label">{s.salesperson?.name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </RecordSection>
      )}
      </>
      )}

      {tab === 'orders' && (
      <>
      <RecordSection title={`Orders (${orders.length})`}>
        {hist.isLoading ? <Spinner /> : orders.length === 0 ? (
          <div className="card"><div className="empty">No orders on record.</div></div>
        ) : (
          <div className="card">
            <table>
              <thead><tr><th>Order</th><th>Courses</th><th>Payment</th><th className="right">Amount</th></tr></thead>
              <tbody>
                {orders.map((o: any) => {
                  const cs = collectionState(o)
                  return (
                    <tr key={o.order_id}>
                      <td>
                        <Link href={`/orders/${o.order_id}`} style={{ fontWeight: 600 }}>{o.order_id}</Link>
                        <div className="fill-label">{shortDate(o.order_date)} · {o.fulfillment_stage}</div>
                      </td>
                      <td className="fill-label">{o.lines?.map((l: any) => l.course?.course_name).filter(Boolean).join(', ') || '—'}</td>
                      <td>
                        {o.payment_status}
                        {cs !== 'None' && cs !== 'Not due' && cs !== 'Paid' && <> · <Badge tone={collectionTone(cs)}>{cs}</Badge></>}
                      </td>
                      <td className="right">{php(o.total_amount)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </RecordSection>

      {/* Sessions booked — folded in from the retired Sessions tab (they hang off
          the same orders, so they belong on the commercial view, not a 6th tab). */}
      {sessions.length > 0 && (
      <RecordSection title={`Sessions booked (${sessions.length})`}>
        <div className="card">
          <table>
            <thead><tr><th>Course</th><th>Dates</th></tr></thead>
            <tbody>
              {sessions.map((s: any) => (
                <tr key={s.schedule_id}>
                  <td><Link href={`/session/${s.schedule_id}`} style={{ fontWeight: 600 }}>{s.course || 'Session'}</Link></td>
                  <td className="fill-label">
                    {s.schedule ? formatSegments(s.schedule.date_segments, s.schedule.start_date, s.schedule.end_date) : 'E-learning'}
                    {s.schedule?.status ? ` · ${s.schedule.status}` : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </RecordSection>
      )}
      </>
      )}

      {tab === 'contacts' && (
      <RecordSection title="Contacts and interactions">
        <div className="card card-pad"><ContactsPanel clientId={id} /></div>
      </RecordSection>
      )}

      {tab === 'files' && (
      <RecordSection title="Files">
        <div className="card card-pad"><AttachmentsPanel entityType="client" entityId={id} /></div>
      </RecordSection>
      )}

      {tab === 'activity' && (
      <RecordSection title="Activity">
        <ActivityTimeline
          events={mergeActivity(
            taskEvents(activity.data?.tasks),
            notificationEvents(activity.data?.notifs),
            auditEvents(audit.data)
          )}
          loading={activity.isLoading}
        />
      </RecordSection>
      )}
    </>
  )
}
