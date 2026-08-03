import { useMemo, useState } from 'react'
import { useOrders } from '../hooks/data'
import { Spinner, ErrorNote, StatusPill, ChannelPill } from '../components/ui'
import { php, shortDate } from '../lib/format'

export default function Orders() {
  const orders = useOrders()
  const [channel, setChannel] = useState('all')
  const [pay, setPay] = useState('all')
  const [q, setQ] = useState('')

  const rows = useMemo(() => {
    if (!orders.data) return []
    const term = q.trim().toLowerCase()
    return orders.data.filter(
      (o) =>
        (channel === 'all' || o.channel === channel) &&
        (pay === 'all' || o.payment_status === pay) &&
        (!term ||
          o.order_id.toLowerCase().includes(term) ||
          o.client?.company?.toLowerCase().includes(term) ||
          o.client?.name?.toLowerCase().includes(term) ||
          o.course?.course_name?.toLowerCase().includes(term))
    )
  }, [orders.data, channel, pay, q])

  if (orders.isLoading) return <Spinner label="Loading orders" />
  if (orders.error) return <ErrorNote error={orders.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p>The full order book. Everyone reads it. Sales edit only their own.</p>
        </div>
      </div>

      <div className="filters">
        <input placeholder="Search order, company, course…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
        <select value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">All channels</option>
          {['Webshop', 'Inside Sales', 'Field Sales', 'In-house Request'].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select value={pay} onChange={(e) => setPay(e.target.value)}>
          <option value="all">All payments</option>
          {['Unpaid', 'Partial', 'Paid'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Company</th>
              <th>Course</th>
              <th>Channel</th>
              <th className="right">Pax</th>
              <th className="right">Amount</th>
              <th>Payment</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 400).map((o) => (
              <tr key={o.order_id}>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{o.order_id}</td>
                <td>{shortDate(o.order_date)}</td>
                <td>{o.client?.company || o.client?.name || '—'}</td>
                <td>{o.course?.course_name || '—'}</td>
                <td><ChannelPill value={o.channel} /></td>
                <td className="right">{o.seats}</td>
                <td className="right">{php(o.amount_php)}</td>
                <td>{o.payment_status}</td>
                <td><StatusPill value={o.order_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No orders match these filters.</div>}
        {rows.length > 400 && <div className="empty muted">Showing first 400 of {rows.length}. Narrow with filters.</div>}
      </div>
    </>
  )
}
