'use client'
import { Fragment, useMemo, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useOrders } from '../hooks/data'
import { Spinner, ErrorNote, ChannelPill } from '../components/ui'
import OrderDrawer from '../components/OrderDrawer'
import { php, shortDate } from '../lib/format'
import { formatSegments } from '../lib/labels'

const STAGES = ['New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback', 'Cancelled']

export default function Orders() {
  const orders = useOrders()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [open, setOpen] = useState<any>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const q = params.get('q') || ''
  const stage = params.get('stage') || 'all'
  const pay = params.get('pay') || 'all'
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params.toString())
    if (!v || v === 'all') n.delete(k)
    else n.set(k, v)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  const rows = useMemo(() => {
    if (!orders.data) return []
    const t = q.trim().toLowerCase()
    return orders.data.filter(
      (o: any) =>
        (stage === 'all' || o.fulfillment_stage === stage) &&
        (pay === 'all' || o.payment_status === pay) &&
        (!t ||
          o.order_id?.toLowerCase().includes(t) ||
          o.client?.company?.toLowerCase().includes(t) ||
          o.client?.name?.toLowerCase().includes(t) ||
          o.sap_order_no?.toLowerCase().includes(t) ||
          o.lines?.some((l: any) => l.course?.course_name?.toLowerCase().includes(t)))
    )
  }, [orders.data, q, stage, pay])

  if (orders.isLoading) return <Spinner label="Loading orders" />
  if (orders.error) return <ErrorNote error={orders.error} />

  const totalValue = rows.reduce((n: number, o: any) => n + Number(o.total_amount || 0), 0)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Orders</h1>
          <p>{rows.length} order{rows.length === 1 ? '' : 's'} · {php(totalValue)}. One row per order, expand for its training lines.</p>
        </div>
      </div>

      <div className="filters">
        <input placeholder="Search order, company, SAP, course…" value={q} onChange={(e) => setParam('q', e.target.value)} style={{ minWidth: 240 }} />
        <select value={stage} onChange={(e) => setParam('stage', e.target.value)}>
          <option value="all">All stages</option>
          {STAGES.map((s) => (<option key={s}>{s}</option>))}
        </select>
        <select value={pay} onChange={(e) => setParam('pay', e.target.value)}>
          <option value="all">All payments</option>
          {['Paid', 'Unpaid', 'Partial'].map((p) => (<option key={p}>{p}</option>))}
        </select>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Order</th><th>Customer</th><th>Stage</th><th>SAP</th>
              <th>Channel</th><th className="right">Seats</th><th className="right">Amount</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((o: any) => (
              <Fragment key={o.order_id}>
                <tr className="clickable" onClick={() => setOpen(o)}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {o.order_id}
                    <div className="fill-label">{shortDate(o.order_date)}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{o.client?.company || o.client?.name || '—'}</div>
                    <div className="fill-label">
                      {o.lines?.length || 0} line{(o.lines?.length || 0) === 1 ? '' : 's'} ·{' '}
                      {o.assignment?.[0]?.salesperson?.name || 'unassigned'}
                    </div>
                  </td>
                  <td><span className="pill pill-webshop">{o.fulfillment_stage}</span></td>
                  <td className="fill-label">{o.sap_order_no || '—'}</td>
                  <td><ChannelPill value={o.channel} /></td>
                  <td className="right">{o.total_seats}</td>
                  <td className="right">{php(o.total_amount)}</td>
                  <td className="right" onClick={(e) => e.stopPropagation()}>
                    {(o.lines?.length || 0) > 1 && (
                      <button className="linkbtn" onClick={() => setExpanded({ ...expanded, [o.order_id]: !expanded[o.order_id] })}>
                        {expanded[o.order_id] ? 'Hide' : 'Lines'}
                      </button>
                    )}
                  </td>
                </tr>
                {expanded[o.order_id] &&
                  o.lines?.map((l: any) => (
                    <tr key={l.line_id} style={{ background: 'var(--tr-bg)' }}>
                      <td></td>
                      <td colSpan={3} className="fill-label">
                        {l.line_no}. {l.course?.course_name}
                        {l.schedule && ` · ${formatSegments(l.schedule.date_segments, l.schedule.start_date, l.schedule.end_date)}`}
                      </td>
                      <td className="fill-label">{l.line_status}</td>
                      <td className="right fill-label">{l.seats}</td>
                      <td className="right fill-label">{php(l.amount_php)}</td>
                      <td></td>
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No orders match.</div>}
        {rows.length > 300 && <div className="empty muted">Showing first 300 of {rows.length}.</div>}
      </div>

      {open && <OrderDrawer order={open} onClose={() => setOpen(null)} />}
    </>
  )
}
