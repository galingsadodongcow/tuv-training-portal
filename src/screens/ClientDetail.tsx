'use client'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useClient, useClientHistory, useEntityActivity, useAuditTrail, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { RecordHeader, RecordSection, KeyVal, Badge } from '../components/record'
import ActivityTimeline from '../components/ActivityTimeline'
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
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidate()
  const client = useClient(id)
  const hist = useClientHistory(id)
  const activity = useEntityActivity('client', id)
  const audit = useAuditTrail('client', id)

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

  const setDeleted = async (value: string | null) => {
    const { error } = await supabase.from('client').update({ deleted_at: value }).eq('client_id', id)
    if (error) toast.error(error.message)
    else { toast.success(value ? 'Customer archived.' : 'Customer restored.'); invalidate(['client', 'clients']) }
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

  return (
    <>
      <RecordHeader
        back={{ href: '/clients', label: 'Clients' }}
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
            ? <button className="btn btn-ghost btn-sm" onClick={() => setDeleted(null)}>Restore</button>
            : <button className="btn btn-danger btn-sm" onClick={archive}>Archive</button>)
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

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          <KeyVal label="Contact">{c.contact || c.name || '—'}</KeyVal>
          <KeyVal label="Email">{c.email || '—'}</KeyVal>
          <KeyVal label="Phone">{c.phone || '—'}</KeyVal>
          <KeyVal label="Industry">{c.industry || '—'}</KeyVal>
        </div>
      </div>

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

      <RecordSection title={`Sessions booked (${sessions.length})`}>
        {sessions.length === 0 ? (
          <div className="card"><div className="empty">No sessions booked.</div></div>
        ) : (
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
        )}
      </RecordSection>

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
    </>
  )
}
