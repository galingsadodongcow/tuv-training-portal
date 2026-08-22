import Link from 'next/link'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/AppShell'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { createCustomerAction } from '@/features/sales/actions'
import { getCommercialWorkspace } from '@/features/sales/queries'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canViewCustomers, canWriteSales } from '@/lib/permissions'

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; message?: string; error?: string }>
}) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active) redirect('/')
  if (!canViewCustomers(profile.role)) redirect('/')
  const [workspace, query] = await Promise.all([getCommercialWorkspace(), searchParams])
  const search = query.q?.trim().toLowerCase() ?? ''
  const customers = workspace.customers.filter((customer) => !search || [customer.name, customer.email_domain, customer.industry].some((value) => value?.toLowerCase().includes(search)))

  return (
    <AppShell profile={profile} active="customers">
      <div className="page-heading"><div><p className="eyebrow">Customers</p><h1>Customer directory</h1><p>One company record supports contacts, inquiries, quotations, orders, and delivery history.</p></div><div className="summary-chip">{workspace.customers.length} companies</div></div>
      {query.message ? <div className="alert alert-success" role="status">{query.message}</div> : null}
      {query.error ? <div className="alert alert-error" role="alert">{query.error}</div> : null}

      <section className="workspace-section" aria-labelledby="directory-title">
        <div className="section-heading"><div><h2 id="directory-title">Search before creating</h2><p>Normalized company name and email domain prevent common duplicates.</p></div></div>
        <form method="get" className="search-form"><label className="field"><span className="sr-only">Search customers</span><input name="q" defaultValue={query.q ?? ''} placeholder="Company, domain, or industry" /></label><Button className="button-secondary" type="submit">Search</Button>{search ? <Link className="button button-quiet" href="/customers">Clear</Link> : null}</form>
        {customers.length === 0 ? <EmptyState>No customer matches this search.</EmptyState> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Industry</th><th>Contacts</th><th>Open inquiries</th><th>Orders</th><th>Status</th></tr></thead><tbody>{customers.map((customer) => {
          const contacts = workspace.contacts.filter((item) => item.customer_id === customer.id && item.is_active).length
          const inquiries = workspace.inquiries.filter((item) => item.customer_id === customer.id && !['won', 'lost'].includes(item.status)).length
          const orders = workspace.orders.filter((item) => item.customer_id === customer.id).length
          return <tr key={customer.id}><td><Link className="cell-title table-link" href={`/customers/${customer.id}`}>{customer.name}</Link><span className="cell-subtitle">{customer.email_domain ?? 'No domain recorded'}</span></td><td>{customer.industry ?? '—'}</td><td>{contacts}</td><td>{inquiries}</td><td>{orders}</td><td><span className={`workflow-status status-${customer.status}`}>{customer.status}</span></td></tr>
        })}</tbody></table></div>}
      </section>

      {canWriteSales(profile) ? <section className="workspace-section" aria-labelledby="new-customer-title"><div className="section-heading"><div><h2 id="new-customer-title">New customer</h2><p>Create only after the directory search confirms the company is absent.</p></div></div><form action={createCustomerAction} className="workflow-form"><div className="field-grid field-grid-three"><label className="field"><span>Company name</span><input name="name" minLength={2} maxLength={160} required /></label><label className="field"><span>Email domain <small>without @</small></span><input name="email_domain" placeholder="example.com" /></label><label className="field"><span>Industry</span><input name="industry" maxLength={100} /></label><label className="field field-wide"><span>Address</span><textarea name="address" rows={2} maxLength={500} /></label></div><Button type="submit">Create customer</Button></form></section> : null}
    </AppShell>
  )
}
