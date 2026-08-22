import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { createContactAction } from '@/features/sales/actions'
import { getCommercialWorkspace } from '@/features/sales/queries'
import { displayNumber } from '@/features/sales/rules'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewCustomers, canWriteSales } from '@/lib/permissions'

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ message?: string; error?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewCustomers(profile.role)) redirect('/')
  const [{ id }, notice, workspace] = await Promise.all([params, searchParams, getCommercialWorkspace()])
  const customer = workspace.customers.find((item) => item.id === id)
  if (!customer) notFound()
  const contacts = workspace.contacts.filter((item) => item.customer_id === id)
  const inquiries = workspace.inquiries.filter((item) => item.customer_id === id)
  const quotations = workspace.quotations.filter((item) => item.customer_id === id)
  const orders = workspace.orders.filter((item) => item.customer_id === id)
  const profileName = new Map(workspace.profiles.map((item) => [item.id, item.full_name]))

  return (
    <AppShell profile={profile} active="customers">
      <div className="breadcrumb"><Link href="/customers">Customers</Link><span>/</span><span>{customer.name}</span></div>
      <div className="page-heading"><div><p className="eyebrow">Customer 360</p><h1>{customer.name}</h1><p>{customer.industry ?? 'Industry not recorded'} · {customer.email_domain ?? 'No domain'} · {customer.address ?? 'No address'}</p></div><span className={`workflow-status status-${customer.status}`}>{customer.status}</span></div>
      {notice.message ? <div className="alert alert-success" role="status">{notice.message}</div> : null}
      {notice.error ? <div className="alert alert-error" role="alert">{notice.error}</div> : null}

      <section className="metric-grid"><div className="metric-card"><p>Contacts</p><strong>{contacts.length}</strong><span>Company people</span></div><div className="metric-card"><p>Inquiries</p><strong>{inquiries.length}</strong><span>Visible commercial interest</span></div><div className="metric-card"><p>Quotations</p><strong>{quotations.length}</strong><span>Offer history</span></div><div className="metric-card"><p>Orders</p><strong>{orders.length}</strong><span>Delivery commitments</span></div></section>

      <section className="workspace-section" aria-labelledby="contacts-title"><div className="section-heading"><div><h2 id="contacts-title">Contacts</h2><p>Customer people are maintained inside the authoritative company record.</p></div></div>{contacts.length === 0 ? <EmptyState>No contacts are visible.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Name</th><th>Role</th><th>Email</th><th>Phone</th><th>Status</th></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id}><td className="cell-strong">{contact.full_name}</td><td>{contact.job_title ?? '—'}</td><td>{contact.email ?? '—'}</td><td>{contact.phone ?? '—'}</td><td><span className={`workflow-status status-${contact.is_active ? 'active' : 'archived'}`}>{contact.is_active ? 'active' : 'inactive'}</span></td></tr>)}</tbody></table></div>}
      {canWriteSales(profile) ? <form action={createContactAction} className="workflow-form form-spaced"><input type="hidden" name="customer_id" value={customer.id} /><h3>Add contact</h3><div className="field-grid field-grid-three"><label className="field"><span>Full name</span><input name="full_name" minLength={2} maxLength={120} required /></label><label className="field"><span>Job title</span><input name="job_title" maxLength={100} /></label><label className="field"><span>Email</span><input name="email" type="email" /></label><label className="field"><span>Phone</span><input name="phone" /></label></div><Button type="submit">Add contact</Button></form> : null}</section>

      <section className="workspace-section" aria-labelledby="history-title"><div className="section-heading"><div><h2 id="history-title">Commercial history</h2><p>Available records reflect the signed-in user’s database scope.</p></div></div>{!inquiries.length && !quotations.length && !orders.length ? <EmptyState>No commercial history is visible.</EmptyState> : <div className="timeline-list">{inquiries.map((item) => <div key={item.id} className="timeline-item"><span className="code">{displayNumber('INQ', item.inquiry_number)}</span><div><strong>{item.requirement_summary}</strong><p>{item.status} · Owner: {profileName.get(item.owner_id) ?? '—'}</p></div></div>)}{quotations.map((item) => <Link key={item.id} className="timeline-item" href={`/sales/quotes/${item.id}`}><span className="code">{displayNumber('Q', item.quotation_number)}</span><div><strong>Quotation · {item.status}</strong><p>{Number(item.discount_percent)}% discount · {item.approval_status.replace('_', ' ')}</p></div></Link>)}{orders.map((item) => <Link key={item.id} className="timeline-item" href={`/sales/orders/${item.id}`}><span className="code">{displayNumber('ORD', item.order_number)}</span><div><strong>Order · {item.status.replaceAll('_', ' ')}</strong><p>Requested {item.requested_start_date ?? 'date not set'}</p></div></Link>)}</div>}</section>
    </AppShell>
  )
}
