import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { MetricCard } from '@/components/ui/MetricCard'
import { createInquiryAction, createQuotationAction, qualifyInquiryAction } from '@/features/sales/actions'
import { getCommercialWorkspace } from '@/features/sales/queries'
import { displayNumber } from '@/features/sales/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canApproveDiscount, canViewSales } from '@/lib/permissions'

export default async function SalesPage({ searchParams }: { searchParams: Promise<{ message?: string; error?: string }> }) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewSales(profile.role)) redirect('/')

  const [workspace, notice] = await Promise.all([getCommercialWorkspace(), searchParams])
  const customerName = new Map(workspace.customers.map((item) => [item.id, item.name]))
  const profileName = new Map(workspace.profiles.map((item) => [item.id, item.full_name]))
  const courseName = new Map(workspace.courses.map((item) => [item.id, `${item.code} · ${item.title}`]))
  const salesProfiles = workspace.profiles.filter((item) => item.role === 'sales')
  const openInquiries = workspace.inquiries.filter((item) => !['won', 'lost'].includes(item.status))
  const pendingApprovals = workspace.quotations.filter((item) => item.approval_status === 'pending')
  const activeOrders = workspace.orders.filter((item) => !['completed', 'cancelled'].includes(item.status))

  return (
    <AppShell profile={profile} active="sales">
      <div className="page-heading">
        <div><p className="eyebrow">Sales</p><h1>Pipeline, quotations, and orders</h1><p>Capture the requirement once, then carry the same customer, course, quantity, price, and owner into handoff.</p></div>
        <div className="summary-chip">{profile.is_sales_supervisor ? 'Team scope' : 'My portfolio'}</div>
      </div>

      {notice.message ? <div className="alert alert-success" role="status">{notice.message}</div> : null}
      {notice.error ? <div className="alert alert-error" role="alert">{notice.error}</div> : null}

      <section className="metric-grid" aria-label="Commercial work summary">
        <MetricCard label="Open inquiries" value={openInquiries.length} detail="New through quoted" />
        <MetricCard label="Quotations" value={workspace.quotations.length} detail={`${pendingApprovals.length} awaiting approval`} />
        <MetricCard label="Active orders" value={activeOrders.length} detail="Before completion" />
        <MetricCard label="Customers" value={workspace.customers.length} detail="One authoritative directory" />
      </section>

      <nav className="anchor-nav" aria-label="Sales sections"><a href="#new-inquiry">New inquiry</a><a href="#pipeline">Pipeline</a><a href="#quotations">Quotations</a><a href="#orders">Orders</a></nav>

      <section className="workspace-section" aria-labelledby="new-inquiry">
        <div className="section-heading"><div><h2 id="new-inquiry">New inquiry</h2><p>Search the customer directory before creating another company.</p></div><Link className="table-link" href="/customers">Open customers</Link></div>
        <form action={createInquiryAction} className="workflow-form">
          <div className="field-grid field-grid-three">
            <label className="field"><span>Customer</span><select name="customer_id" required defaultValue=""><option value="" disabled>Choose customer</option>{workspace.customers.filter((item) => item.status === 'active').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label className="field"><span>Contact <small>optional</small></span><select name="contact_id" defaultValue=""><option value="">Not selected</option>{workspace.contacts.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{customerName.get(item.customer_id)} · {item.full_name}</option>)}</select></label>
            <label className="field"><span>Primary course <small>optional</small></span><select name="course_id" defaultValue=""><option value="">To be confirmed</option>{workspace.courses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label>
            <label className="field field-wide"><span>Training requirement</span><textarea name="requirement_summary" rows={3} minLength={5} maxLength={1000} required /></label>
            <label className="field"><span>Participant estimate</span><input name="participant_estimate" type="number" min="1" step="1" /></label>
            <label className="field"><span>Next action</span><input name="next_action" maxLength={300} placeholder="Call to confirm dates" /></label>
            <label className="field"><span>Follow-up date</span><input name="follow_up_on" type="date" /></label>
            {canApproveDiscount(profile) ? <label className="field"><span>Sales owner</span><select name="owner_id" defaultValue={profile.role === 'sales' ? profile.id : salesProfiles[0]?.id}>{salesProfiles.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label> : null}
          </div>
          <Button type="submit" disabled={!workspace.customers.length}>Record inquiry</Button>
        </form>
      </section>

      <section className="workspace-section" aria-labelledby="pipeline">
        <div className="section-heading"><div><h2 id="pipeline">Pipeline</h2><p>Only your portfolio is visible unless you hold Sales Supervisor scope.</p></div></div>
        {workspace.inquiries.length === 0 ? <EmptyState>No inquiries are visible.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Inquiry</th><th>Customer / requirement</th><th>Interest</th><th>Owner</th><th>Follow-up</th><th>Status / next action</th></tr></thead><tbody>{workspace.inquiries.map((inquiry) => {
          const quotation = workspace.quotations.find((item) => item.inquiry_id === inquiry.id)
          return <tr key={inquiry.id}>
            <td className="code">{displayNumber('INQ', inquiry.inquiry_number)}</td>
            <td><Link className="cell-title table-link" href={`/customers/${inquiry.customer_id}`}>{customerName.get(inquiry.customer_id)}</Link><span className="cell-subtitle">{inquiry.requirement_summary}</span></td>
            <td>{inquiry.course_id ? courseName.get(inquiry.course_id) : 'To confirm'}{inquiry.participant_estimate ? ` · ${inquiry.participant_estimate} pax` : ''}</td>
            <td>{profileName.get(inquiry.owner_id) ?? '—'}</td>
            <td>{inquiry.follow_up_on ?? '—'}<span className="cell-subtitle">{inquiry.next_action ?? 'No next action'}</span></td>
            <td><span className={`workflow-status status-${inquiry.status}`}>{inquiry.status}</span><div className="row-actions">{inquiry.status === 'new' ? <form action={qualifyInquiryAction}><input type="hidden" name="inquiry_id" value={inquiry.id} /><Button className="button-quiet button-small" type="submit">Qualify</Button></form> : null}{inquiry.status === 'qualified' ? <form action={createQuotationAction}><input type="hidden" name="inquiry_id" value={inquiry.id} /><Button className="button-quiet button-small" type="submit">Create quote</Button></form> : null}{quotation ? <Link className="table-link" href={`/sales/quotes/${quotation.id}`}>Open quote</Link> : null}</div></td>
          </tr>
        })}</tbody></table></div>}
      </section>

      <section className="workspace-section" aria-labelledby="quotations">
        <div className="section-heading"><div><h2 id="quotations">Quotations</h2><p>Discounts above 10% require approval by someone other than the quotation owner.</p></div></div>
        {workspace.quotations.length === 0 ? <EmptyState>Create a quote from a qualified inquiry.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Quotation</th><th>Customer</th><th>Owner</th><th>Discount</th><th>Approval</th><th>Status</th></tr></thead><tbody>{workspace.quotations.map((quotation) => <tr key={quotation.id}><td><Link className="code table-link" href={`/sales/quotes/${quotation.id}`}>{displayNumber('Q', quotation.quotation_number)}</Link></td><td>{customerName.get(quotation.customer_id)}</td><td>{profileName.get(quotation.owner_id) ?? '—'}</td><td>{Number(quotation.discount_percent)}%</td><td><span className={`workflow-status status-${quotation.approval_status}`}>{quotation.approval_status.replace('_', ' ')}</span></td><td><span className={`workflow-status status-${quotation.status}`}>{quotation.status}</span></td></tr>)}</tbody></table></div>}
      </section>

      <section className="workspace-section" aria-labelledby="orders">
        <div className="section-heading"><div><h2 id="orders">Orders</h2><p>Responsibility is visible from the order status; no duplicate task record is maintained.</p></div></div>
        {workspace.orders.length === 0 ? <EmptyState>Accept a quotation, then convert it to an order.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Sales owner</th><th>Requested</th><th>Status</th></tr></thead><tbody>{workspace.orders.map((order) => <tr key={order.id}><td><Link className="code table-link" href={`/sales/orders/${order.id}`}>{displayNumber('ORD', order.order_number)}</Link></td><td>{customerName.get(order.customer_id)}</td><td>{profileName.get(order.sales_owner_id) ?? '—'}</td><td>{order.requested_start_date ?? 'Not set'}</td><td><span className={`workflow-status status-${order.status}`}>{order.status.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table></div>}
      </section>
    </AppShell>
  )
}
