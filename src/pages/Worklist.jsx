import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useOrders, useSalespeople, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote, StatusPill, ChannelPill } from '../components/ui'
import { php, shortDate } from '../lib/format'
import { formatSegments } from '../lib/labels'
import TransferOrder from '../components/TransferOrder'

export default function Worklist() {
  const { profile } = useAuth()
  const orders = useOrders()
  const people = useSalespeople()
  const invalidate = useInvalidate()
  const [tab, setTab] = useState('mine')
  const [busy, setBusy] = useState('')
  const [transferring, setTransferring] = useState(null)

  const role = profile?.role
  const myCode = profile?.salesperson?.code
  const isSupervisor = profile?.salesperson?.is_supervisor
  const canAssignAny = ['super_admin', 'business_owner'].includes(role) || isSupervisor

  const rows = useMemo(() => {
    if (!orders.data) return []
    const withAssign = orders.data.map((o) => ({ ...o, a: o.assignment?.[0] || null }))
    if (tab === 'unassigned') return withAssign.filter((o) => !o.a && o.order_status !== 'Cancelled')
    if (tab === 'mine') return withAssign.filter((o) => o.a?.salesperson?.code === myCode)
    return withAssign
  }, [orders.data, tab, myCode])

  const selfAssign = async (orderId) => {
    setBusy(orderId)
    const { error } = await supabase.from('order_assignment').insert({ order_id: orderId, sales_id: profile.sales_id })
    if (!error) invalidate(['orders'])
    setBusy('')
  }

  const reassign = async (orderId, salesId) => {
    setBusy(orderId)
    const { data: existing } = await supabase.from('order_assignment').select('order_id').eq('order_id', orderId).maybeSingle()
    if (existing) await supabase.from('order_assignment').update({ sales_id: salesId }).eq('order_id', orderId)
    else await supabase.from('order_assignment').insert({ order_id: orderId, sales_id: salesId })
    invalidate(['orders'])
    setBusy('')
  }

  const updateStatus = async (orderId, field, value) => {
    setBusy(orderId)
    await supabase.from('order_assignment').update({ [field]: value }).eq('order_id', orderId)
    invalidate(['orders'])
    setBusy('')
  }

  if (orders.isLoading) return <Spinner label="Loading worklist" />
  if (orders.error) return <ErrorNote error={orders.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Fulfillment worklist</h1>
          <p>Pick up orders, track engagement and collection. Supervisors and the business owner assign across the team.</p>
        </div>
      </div>

      <div className="filters">
        {['mine', 'unassigned', 'all'].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? '' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t === 'mine' ? 'My orders' : t === 'unassigned' ? 'Unassigned' : 'All'}
          </button>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Order</th><th>Company</th><th>Course</th><th>Session</th><th>Channel</th>
              <th>Owner</th><th>Engagement</th><th>Collection</th><th className="right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 300).map((o) => (
              <tr key={o.order_id}>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{o.order_id}<div className="fill-label">{shortDate(o.order_date)}</div></td>
                <td>{o.client?.company || o.client?.name || '—'}</td>
                <td>{o.course?.course_name || '—'}</td>
                <td className="fill-label">
                  {o.schedule ? formatSegments(o.schedule.date_segments, o.schedule.start_date, o.schedule.end_date) : '—'}
                  {o.schedule && o.order_status !== 'Cancelled' && (
                    <div><button className="linkbtn" style={{ padding: 0 }} onClick={() => setTransferring(o)}>Transfer</button></div>
                  )}
                </td>
                <td><ChannelPill value={o.channel} /></td>
                <td>
                  {canAssignAny ? (
                    <select value={o.a?.sales_id || ''} disabled={busy === o.order_id}
                      onChange={(e) => reassign(o.order_id, e.target.value)} style={{ minWidth: 130 }}>
                      <option value="">Unassigned</option>
                      {people.data?.map((p) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
                    </select>
                  ) : o.a ? (
                    o.a.salesperson?.name
                  ) : (
                    <button className="btn btn-sm" disabled={busy === o.order_id} onClick={() => selfAssign(o.order_id)}>Pick up</button>
                  )}
                </td>
                <td>
                  {o.a && (o.a.salesperson?.code === myCode || canAssignAny) ? (
                    <select value={o.a.engagement_status || ''} disabled={busy === o.order_id}
                      onChange={(e) => updateStatus(o.order_id, 'engagement_status', e.target.value || null)}>
                      <option value="">—</option>
                      {['Engaged', 'Closed', 'Lost'].map((s) => (<option key={s}>{s}</option>))}
                    </select>
                  ) : (o.a?.engagement_status || '—')}
                </td>
                <td>
                  {o.a && (o.a.salesperson?.code === myCode || canAssignAny) ? (
                    <select value={o.a.collection_status || 'Pending'} disabled={busy === o.order_id}
                      onChange={(e) => updateStatus(o.order_id, 'collection_status', e.target.value)}>
                      {['Pending', 'Partial', 'Collected'].map((s) => (<option key={s}>{s}</option>))}
                    </select>
                  ) : (o.a?.collection_status || '—')}
                </td>
                <td className="right">{php(o.amount_php)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No orders in this view.</div>}
      </div>

      {transferring && (
        <TransferOrder
          order={transferring}
          courseId={transferring.course_id}
          fromScheduleId={transferring.schedule_id}
          onClose={() => setTransferring(null)}
        />
      )}
    </>
  )
}
