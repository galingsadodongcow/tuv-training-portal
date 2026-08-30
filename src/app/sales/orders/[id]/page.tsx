import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { prepareOrderAction, transitionOrderAction } from '@/features/sales/actions'
import { getCommercialWorkspace } from '@/features/sales/queries'
import { displayNumber, orderTotal } from '@/features/sales/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canWriteSales } from '@/lib/permissions'

const money = (amount: number, currency = 'PHP') => new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount)

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  const [{ id }, notice, workspace] = await Promise.all([params, searchParams, getCommercialWorkspace()])
  const order = workspace.orders.find((item) => item.id === id)
  if (!order) notFound()

  const lines = workspace.orderLines.filter((item) => item.order_id === id)
  const customer = workspace.customers.find((item) => item.id === order.customer_id)
  const contact = workspace.contacts.find((item) => item.id === order.contact_id)
  const salesOwner = workspace.profiles.find((item) => item.id === order.sales_owner_id)
  const operationsOwner = workspace.profiles.find((item) => item.id === order.operations_owner_id)
  const operationsTarget = workspace.profiles.find((item) => item.id === order.operations_target_id)
  const courseName = new Map(workspace.courses.map((item) => [item.id, `${item.code} · ${item.title}`]))
  const activeArea = profile.role === 'operations' ? 'my-work' : profile.role === 'manager' || profile.role === 'auditor' ? 'overview' : 'sales'
  const isOperations = profile.role === 'operations' || profile.role === 'administrator'
  const isSalesWriter = canWriteSales(profile)

  return (
    <AppShell profile={profile} active={activeArea}>
      <div className="breadcrumb"><Link href={profile.role === 'operations' ? '/my-work' : '/sales'}>{profile.role === 'operations' ? 'My Work' : 'Sales'}</Link><span>/</span><span>{displayNumber('ORD', order.order_number)}</span></div>
      <div className="page-heading"><div><p className="eyebrow">Order</p><h1>{displayNumber('ORD', order.order_number)} · {customer?.name}</h1><p>Sales owner: {salesOwner?.full_name ?? '—'} · Operations owner: {operationsOwner?.full_name ?? 'Not accepted'}</p></div><span className={`workflow-status status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span></div>
      {notice.message ? <div className="alert alert-success" role="status">{notice.message}</div> : null}
      {notice.error ? <div className="alert alert-error" role="alert">{notice.error}</div> : null}
      {order.status === 'returned' && order.operations_note ? <div className="alert alert-error" role="alert"><strong>Returned for correction:</strong> {order.operations_note}</div> : null}

      <div className="detail-layout">
        <div>
          <section className="workspace-section" aria-labelledby="order-lines-title">
            <div className="section-heading"><div><h2 id="order-lines-title">Order lines</h2><p>Copied from the accepted quotation without re-entry.</p></div></div>
            {lines.length === 0 ? <EmptyState>No order lines are available.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Course</th><th>Modality</th><th>Participants</th><th>Delivery</th><th>Reservation</th><th>Unit price</th><th>Total</th></tr></thead><tbody>{lines.map((line) => { const reservation = workspace.reservations.find((item) => item.order_line_id === line.id && item.status !== 'released'); const selectedSession = workspace.sessions.find((item) => item.id === line.session_id); return <tr key={line.id}><td>{courseName.get(line.course_id)}</td><td className="capitalize">{line.learning_type}</td><td>{line.participant_count}</td><td><span className="capitalize">{line.delivery_intent.replaceAll('_', ' ')}</span>{selectedSession ? <span className="cell-subtitle"><Link className="table-link" href={`/training/sessions/${selectedSession.id}`}>{displayNumber('SES', selectedSession.session_number)}</Link></span> : null}</td><td>{reservation ? <><span className={`workflow-status status-${reservation.status}`}>{reservation.status}</span><span className="cell-subtitle">{reservation.confirmed_seats} confirmed · {reservation.waitlisted_seats} waiting</span></> : 'Operations to schedule'}</td><td>{money(Number(line.unit_price), line.currency)}</td><td>{money(Number(line.unit_price) * line.participant_count, line.currency)}</td></tr> })}</tbody></table></div>}
            <div className="totals-panel"><div className="total-final"><span>Order total</span><strong>{money(orderTotal(lines))}</strong></div></div>
          </section>

          <section className="workspace-section" aria-labelledby="handoff-facts-title">
            <div className="section-heading"><div><h2 id="handoff-facts-title">Handoff facts</h2><p>Required information is validated before responsibility moves.</p></div></div>
            <dl className="detail-grid"><div><dt>Customer contact</dt><dd>{contact ? `${contact.full_name}${contact.email ? ` · ${contact.email}` : ''}` : 'Missing'}</dd></div><div><dt>Requested start</dt><dd>{order.requested_start_date ?? 'Missing'}</dd></div><div><dt>Target Operations owner</dt><dd>{operationsTarget?.full_name ?? 'Missing'}</dd></div><div><dt>Accepted owner</dt><dd>{operationsOwner?.full_name ?? 'Not accepted'}</dd></div><div className="detail-wide"><dt>Delivery notes</dt><dd>{order.delivery_notes ?? 'Missing'}</dd></div><div><dt>Sent to Operations</dt><dd>{order.handoff_sent_at ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.handoff_sent_at)) : 'Not yet'}</dd></div><div><dt>Reviewed</dt><dd>{order.reviewed_at ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.reviewed_at)) : 'Not yet'}</dd></div></dl>
          </section>
        </div>

        <aside className="action-panel" aria-label="Order actions">
          <h2>Order actions</h2>
          {isSalesWriter && ['draft', 'returned'].includes(order.status) ? <form action={prepareOrderAction} className="action-form"><input type="hidden" name="order_id" value={order.id} /><label className="field"><span>Requested start date</span><input name="requested_start_date" type="date" defaultValue={order.requested_start_date ?? ''} required /></label><label className="field"><span>Target Operations owner</span><select name="operations_target_id" required defaultValue={order.operations_target_id ?? ''}><option value="" disabled>Choose owner</option>{workspace.profiles.filter((item) => ['administrator', 'operations'].includes(item.role)).map((item) => <option value={item.id} key={item.id}>{item.full_name}</option>)}</select></label><label className="field"><span>Delivery notes</span><textarea name="delivery_notes" rows={5} minLength={10} maxLength={1000} defaultValue={order.delivery_notes ?? ''} required /></label><Button className="button-secondary" type="submit">Save preparation</Button></form> : null}
          {isSalesWriter && ['draft', 'returned'].includes(order.status) ? <form action={transitionOrderAction}><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="transition" value="send" /><Button type="submit">Send to Operations</Button></form> : null}
          {isOperations && order.status === 'pending_operations' ? <div className="action-stack"><form action={transitionOrderAction}><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="transition" value="accept" /><Button type="submit">Accept handoff</Button></form><form action={transitionOrderAction} className="action-form"><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="transition" value="return" /><label className="field"><span>Correction required</span><textarea name="reason" minLength={5} rows={3} required /></label><Button className="button-secondary" type="submit">Return to Sales</Button></form></div> : null}
          {isOperations && order.status === 'with_operations' ? <form action={transitionOrderAction}><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="transition" value="start" /><Button type="submit">Start fulfillment</Button></form> : null}
          {isOperations && order.status === 'fulfillment' ? <form action={transitionOrderAction}><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="transition" value="complete" /><Button type="submit">Complete order</Button></form> : null}
          {(isSalesWriter || isOperations) && !['completed', 'cancelled'].includes(order.status) ? <details><summary>Cancel order</summary><form action={transitionOrderAction} className="action-form"><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="transition" value="cancel" /><label className="field"><span>Reason</span><textarea name="reason" minLength={5} rows={3} required /></label><Button type="submit">Cancel and release seats</Button></form></details> : null}
          {!isSalesWriter && !isOperations ? <p className="action-note">This is a read-only oversight view.</p> : null}
          <p className="action-note">Send, accept, return, and completion are atomic and audited.</p>
        </aside>
      </div>
    </AppShell>
  )
}
