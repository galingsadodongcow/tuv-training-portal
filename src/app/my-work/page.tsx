import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import { getCommercialWorkspace } from '@/features/sales/queries'
import { displayNumber, isOverdueInquiry } from '@/features/sales/rules'
import { getTrainingCatalogue } from '@/features/training/queries'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { displaySessionNumber, formatSessionDate, hasIncompleteOutcome } from '@/features/delivery/rules'
import { catalogueMetrics, operationsReadiness } from '@/features/workspaces/derive'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canApproveDiscount, canViewMyWork } from '@/lib/permissions'

export default async function MyWorkPage() {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewMyWork(profile.role)) redirect('/')
  const isOperations = profile.role === 'operations' || profile.role === 'administrator'
  const [workspace, catalogue, delivery] = await Promise.all([
    getCommercialWorkspace(),
    isOperations ? getTrainingCatalogue() : Promise.resolve(null),
    isOperations ? getDeliveryWorkspace() : Promise.resolve(null),
  ])
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const pendingHandoffs = isOperations ? workspace.orders.filter((item) => item.status === 'pending_operations') : []
  const activeDelivery = isOperations ? workspace.orders.filter((item) => ['with_operations', 'fulfillment'].includes(item.status)) : []
  const returnedOrders = profile.role === 'sales' || profile.role === 'administrator' ? workspace.orders.filter((item) => item.status === 'returned') : []
  const overdueFollowUps = profile.role === 'sales' || profile.role === 'administrator' ? workspace.inquiries.filter((item) => isOverdueInquiry(item, today)) : []
  const approvalQueue = canApproveDiscount(profile) ? workspace.quotations.filter((item) => item.approval_status === 'pending' && item.owner_id !== profile.id) : []
  const readiness = catalogue ? operationsReadiness(catalogue) : []
  const deliveryExceptions = delivery ? delivery.sessions.filter((session) => session.status === 'in_progress' && delivery.participants.some((participant) => participant.session_id === session.id && hasIncompleteOutcome(participant))) : []
  const deliveryWaitlist = delivery ? delivery.participants.filter((item) => item.status === 'waitlisted') : []
  const catalogueSummary = catalogue ? catalogueMetrics(catalogue) : null
  const totalActions = pendingHandoffs.length + returnedOrders.length + overdueFollowUps.length + approvalQueue.length + readiness.length + deliveryExceptions.length + deliveryWaitlist.length
  const customerName = new Map(workspace.customers.map((item) => [item.id, item.name]))
  const profileName = new Map(workspace.profiles.map((item) => [item.id, item.full_name]))

  return (
    <AppShell profile={profile} active="my-work">
      <div className="page-heading"><div><p className="eyebrow">My Work</p><h1>Items requiring action</h1><p>Every item is derived from its source record; completing the business action removes it from this queue.</p></div><div className="summary-chip">{totalActions} actions</div></div>
      <section className="metric-grid" aria-label="My Work summary">
        <MetricCard label="Handoffs" value={pendingHandoffs.length} detail="Awaiting Operations" />
        <MetricCard label="Returned orders" value={returnedOrders.length} detail="Sales correction required" />
        <MetricCard label="Follow-ups" value={overdueFollowUps.length} detail="Past due and unresolved" />
        <MetricCard label="Approvals" value={approvalQueue.length} detail="Discount decisions" />
      </section>

      {isOperations ? <section className="workspace-section" aria-labelledby="handoff-title"><div className="section-heading"><div><h2 id="handoff-title">Orders awaiting handoff decision</h2><p>Accept responsibility or return the order with one clear correction reason.</p></div></div>{pendingHandoffs.length === 0 ? <EmptyState>No orders are waiting for Operations.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Sales owner</th><th>Requested</th><th>Next step</th></tr></thead><tbody>{pendingHandoffs.map((order) => <tr key={order.id}><td><Link className="code table-link" href={`/sales/orders/${order.id}`}>{displayNumber('ORD', order.order_number)}</Link></td><td>{customerName.get(order.customer_id)}</td><td>{profileName.get(order.sales_owner_id) ?? '—'}</td><td>{order.requested_start_date}</td><td><Link className="table-link" href={`/sales/orders/${order.id}`}>Review handoff</Link></td></tr>)}</tbody></table></div>}</section> : null}

      {isOperations && activeDelivery.length ? <section className="workspace-section" aria-labelledby="delivery-title"><div className="section-heading"><div><h2 id="delivery-title">Active fulfillment</h2><p>Orders accepted by Operations and not yet completed.</p></div></div><div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Status</th><th>Requested</th></tr></thead><tbody>{activeDelivery.map((order) => <tr key={order.id}><td><Link className="code table-link" href={`/sales/orders/${order.id}`}>{displayNumber('ORD', order.order_number)}</Link></td><td>{customerName.get(order.customer_id)}</td><td><span className={`workflow-status status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span></td><td>{order.requested_start_date}</td></tr>)}</tbody></table></div></section> : null}

      {delivery && (deliveryExceptions.length || deliveryWaitlist.length) ? <section className="workspace-section" aria-labelledby="delivery-actions-title"><div className="section-heading"><div><h2 id="delivery-actions-title">Delivery actions</h2><p>Live participant and outcome exceptions derived from session records.</p></div></div><div className="table-wrap"><table><thead><tr><th>Attention</th><th>Session</th><th>Record</th><th>Required action</th></tr></thead><tbody>{deliveryExceptions.map((session) => <tr key={session.id}><td><span className="attention attention-blocked">Outcomes</span></td><td><Link className="code table-link" href={`/training/sessions/${session.id}`}>{displaySessionNumber(session.session_number)}</Link></td><td>{formatSessionDate(session.starts_at)}</td><td>Finish attendance and assessment before completion.</td></tr>)}{deliveryWaitlist.map((participant) => { const session = delivery.sessions.find((item) => item.id === participant.session_id); return <tr key={participant.id}><td><span className="attention attention-risk">Waitlist</span></td><td>{session ? <Link className="code table-link" href={`/training/sessions/${session.id}`}>{displaySessionNumber(session.session_number)}</Link> : '—'}</td><td>{participant.full_name}</td><td>Monitor capacity or transfer to another course session.</td></tr> })}</tbody></table></div></section> : null}

      {profile.role === 'sales' || profile.role === 'administrator' ? <section className="workspace-section" aria-labelledby="sales-actions-title"><div className="section-heading"><div><h2 id="sales-actions-title">Commercial actions</h2><p>Returned orders and overdue follow-ups remain until their source records are corrected.</p></div></div>{!returnedOrders.length && !overdueFollowUps.length ? <EmptyState>No returned orders or overdue follow-ups.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Attention</th><th>Record</th><th>Customer</th><th>Required action</th></tr></thead><tbody>{returnedOrders.map((order) => <tr key={order.id}><td><span className="attention attention-blocked">Returned</span></td><td><Link className="code table-link" href={`/sales/orders/${order.id}`}>{displayNumber('ORD', order.order_number)}</Link></td><td>{customerName.get(order.customer_id)}</td><td>{order.operations_note ?? 'Correct and resend the handoff.'}</td></tr>)}{overdueFollowUps.map((inquiry) => <tr key={inquiry.id}><td><span className="attention attention-risk">Overdue</span></td><td className="code">{displayNumber('INQ', inquiry.inquiry_number)}</td><td>{customerName.get(inquiry.customer_id)}</td><td>{inquiry.next_action ?? 'Record the next commercial action.'}</td></tr>)}</tbody></table></div>}</section> : null}

      {canApproveDiscount(profile) ? <section className="workspace-section" aria-labelledby="approval-title"><div className="section-heading"><div><h2 id="approval-title">Discount approvals</h2><p>Supervisors can review team quotations but cannot approve their own.</p></div></div>{approvalQueue.length === 0 ? <EmptyState>No team discounts require your decision.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Quotation</th><th>Customer</th><th>Owner</th><th>Discount</th><th>Action</th></tr></thead><tbody>{approvalQueue.map((quotation) => <tr key={quotation.id}><td><Link className="code table-link" href={`/sales/quotes/${quotation.id}`}>{displayNumber('Q', quotation.quotation_number)}</Link></td><td>{customerName.get(quotation.customer_id)}</td><td>{profileName.get(quotation.owner_id)}</td><td>{Number(quotation.discount_percent)}%</td><td><Link className="table-link" href={`/sales/quotes/${quotation.id}`}>Review decision</Link></td></tr>)}</tbody></table></div>}</section> : null}

      {catalogue && catalogueSummary ? <section className="workspace-section" aria-labelledby="readiness-title"><div className="section-heading"><div><h2 id="readiness-title">Configuration readiness</h2><p>{catalogueSummary.activeCourses} active courses · resolve only gaps that affect selling or scheduling.</p></div></div>{readiness.length === 0 ? <EmptyState>Catalogue, trainer competency, and venue setup are ready.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Attention</th><th>Item</th><th>Reason</th><th>Next step</th></tr></thead><tbody>{readiness.map((item) => <tr key={item.id}><td><span className={`attention attention-${item.severity}`}>{item.severity}</span></td><td className="cell-strong">{item.item}</td><td>{item.reason}</td><td><Link className="table-link" href="/administration">Open setup</Link></td></tr>)}</tbody></table></div>}</section> : null}
    </AppShell>
  )
}
