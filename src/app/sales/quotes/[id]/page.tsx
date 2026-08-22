import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import {
  addQuotationLineAction,
  convertQuotationAction,
  removeQuotationLineAction,
  transitionQuotationAction,
  updateQuotationDiscountAction,
} from '@/features/sales/actions'
import { getCommercialWorkspace } from '@/features/sales/queries'
import { displayNumber, quotationTotals } from '@/features/sales/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canApproveDiscount, canViewSales } from '@/lib/permissions'

const money = (amount: number, currency = 'PHP') => new Intl.NumberFormat('en-PH', { style: 'currency', currency }).format(amount)

export default async function QuotationPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewSales(profile.role)) redirect('/')
  const [{ id }, notice, workspace] = await Promise.all([params, searchParams, getCommercialWorkspace()])
  const quotation = workspace.quotations.find((item) => item.id === id)
  if (!quotation) notFound()

  const lines = workspace.quotationLines.filter((item) => item.quotation_id === id)
  const totals = quotationTotals(lines, Number(quotation.discount_percent))
  const customer = workspace.customers.find((item) => item.id === quotation.customer_id)
  const contact = workspace.contacts.find((item) => item.id === quotation.contact_id)
  const owner = workspace.profiles.find((item) => item.id === quotation.owner_id)
  const courseName = new Map(workspace.courses.map((item) => [item.id, `${item.code} · ${item.title}`]))
  const order = workspace.orders.find((item) => item.quotation_id === quotation.id)
  const canReview = canApproveDiscount(profile) && quotation.owner_id !== profile.id

  return (
    <AppShell profile={profile} active="sales">
      <div className="breadcrumb"><Link href="/sales">Sales</Link><span>/</span><span>{displayNumber('Q', quotation.quotation_number)}</span></div>
      <div className="page-heading"><div><p className="eyebrow">Quotation</p><h1>{displayNumber('Q', quotation.quotation_number)} · {customer?.name}</h1><p>Owned by {owner?.full_name ?? 'Sales'}{contact ? ` · Contact: ${contact.full_name}` : ''}</p></div><div className="status-cluster"><span className={`workflow-status status-${quotation.approval_status}`}>{quotation.approval_status.replace('_', ' ')}</span><span className={`workflow-status status-${quotation.status}`}>{quotation.status}</span></div></div>
      {notice.message ? <div className="alert alert-success" role="status">{notice.message}</div> : null}
      {notice.error ? <div className="alert alert-error" role="alert">{notice.error}</div> : null}

      <div className="detail-layout">
        <section className="workspace-section" aria-labelledby="quote-lines-title">
          <div className="section-heading"><div><h2 id="quote-lines-title">Commercial lines</h2><p>Course facts and price are retained as the offer snapshot.</p></div></div>
          {lines.length === 0 ? <EmptyState>No lines yet. Add at least one before submitting.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Course</th><th>Modality</th><th>Participants</th><th>Unit price</th><th>Line total</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td>{courseName.get(line.course_id)}</td><td className="capitalize">{line.learning_type}</td><td>{line.participant_count}</td><td>{money(Number(line.unit_price), line.currency)}</td><td>{money(Number(line.unit_price) * line.participant_count, line.currency)}</td><td className="cell-action">{quotation.status === 'draft' ? <form action={removeQuotationLineAction}><input type="hidden" name="quotation_id" value={quotation.id} /><input type="hidden" name="line_id" value={line.id} /><Button className="button-quiet button-small" type="submit">Remove</Button></form> : null}</td></tr>)}</tbody></table></div>}

          <div className="totals-panel"><div><span>Subtotal</span><strong>{money(totals.subtotal)}</strong></div><div><span>Discount ({Number(quotation.discount_percent)}%)</span><strong>−{money(totals.discount)}</strong></div><div className="total-final"><span>Total</span><strong>{money(totals.total)}</strong></div></div>

          {quotation.status === 'draft' ? <form action={addQuotationLineAction} className="workflow-form form-spaced">
            <input type="hidden" name="quotation_id" value={quotation.id} />
            <h3>Add course line</h3>
            <div className="field-grid field-grid-three">
              <label className="field"><span>Course</span><select name="course_id" required defaultValue=""><option value="" disabled>Choose course</option>{workspace.courses.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.title}</option>)}</select></label>
              <label className="field"><span>Modality</span><select name="learning_type"><option value="classroom">Classroom</option><option value="virtual">Virtual</option><option value="onsite">Onsite</option></select></label>
              <label className="field"><span>Participants</span><input name="participant_count" type="number" min="1" step="1" required /></label>
              <label className="field"><span>Unit price</span><input name="unit_price" type="number" min="0" step="0.01" required /></label>
              <label className="field"><span>Currency</span><input name="currency" defaultValue="PHP" minLength={3} maxLength={3} required /></label>
            </div>
            <p className="form-help">Standard references: {workspace.prices.slice(0, 6).map((price) => `${courseName.get(price.course_id)} (${price.learning_type}: ${money(Number(price.amount), price.currency)})`).join(' · ')}</p>
            <Button type="submit">Add line</Button>
          </form> : null}
        </section>

        <aside className="action-panel" aria-label="Quotation actions">
          <h2>Quotation actions</h2>
          {quotation.status === 'draft' ? <form action={updateQuotationDiscountAction} className="action-form"><input type="hidden" name="quotation_id" value={quotation.id} /><label className="field"><span>Discount percent</span><input name="discount_percent" type="number" min="0" max="100" step="0.01" defaultValue={Number(quotation.discount_percent)} /></label><Button className="button-secondary" type="submit">Save discount</Button></form> : null}
          {quotation.status === 'draft' && quotation.approval_status !== 'pending' ? <form action={transitionQuotationAction}><input type="hidden" name="quotation_id" value={quotation.id} /><input type="hidden" name="transition" value="submit" /><Button type="submit" disabled={!lines.length}>Submit quotation</Button></form> : null}
          {quotation.approval_status === 'pending' ? <p className="action-note">A discount above 10% is waiting for a different Sales Supervisor or Administrator.</p> : null}
          {quotation.approval_status === 'pending' && canReview ? <div className="action-stack"><form action={transitionQuotationAction}><input type="hidden" name="quotation_id" value={quotation.id} /><input type="hidden" name="transition" value="approve" /><Button type="submit">Approve and issue</Button></form><form action={transitionQuotationAction} className="action-form"><input type="hidden" name="quotation_id" value={quotation.id} /><input type="hidden" name="transition" value="reject" /><label className="field"><span>Rejection reason</span><textarea name="reason" minLength={5} rows={2} required /></label><Button className="button-secondary" type="submit">Reject discount</Button></form></div> : null}
          {quotation.status === 'sent' ? <form action={transitionQuotationAction}><input type="hidden" name="quotation_id" value={quotation.id} /><input type="hidden" name="transition" value="accept" /><Button type="submit">Record customer acceptance</Button></form> : null}
          {quotation.status === 'accepted' && !order ? <form action={convertQuotationAction}><input type="hidden" name="quotation_id" value={quotation.id} /><Button type="submit">Create order</Button></form> : null}
          {order ? <Link className="button" href={`/sales/orders/${order.id}`}>Open {displayNumber('ORD', order.order_number)}</Link> : null}
          <p className="action-note">Approval and lifecycle changes are validated and audited by PostgreSQL.</p>
        </aside>
      </div>
    </AppShell>
  )
}
