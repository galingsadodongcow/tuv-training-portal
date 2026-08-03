import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useElearningPending } from '../hooks/data'
import { Spinner, ErrorNote, Empty } from '../components/ui'
import { shortDate } from '../lib/format'

export default function Elearning() {
  const orders = useElearningPending()
  const qc = useQueryClient()

  const grant = async (orderId) => {
    await supabase.rpc('fn_grant_elearning_access', { p_order: orderId })
    qc.invalidateQueries({ queryKey: ['elearning_pending'] })
  }

  if (orders.isLoading) return <Spinner label="Loading e-learning orders" />
  if (orders.error) return <ErrorNote error={orders.error} />

  const pending = orders.data.filter((o) => (o.access_status || 'Not Granted') === 'Not Granted')
  const granted = orders.data.filter((o) => o.access_status === 'Granted')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>E-learning access</h1>
          <p>Self-paced orders have no session. Operations grant platform access here after payment.</p>
        </div>
      </div>

      <h3 style={{ marginBottom: 8 }}>Awaiting access</h3>
      {pending.length === 0 ? (
        <Empty title="All caught up">No e-learning orders are waiting for access.</Empty>
      ) : (
        <div className="card" style={{ marginBottom: 24 }}>
          <table>
            <thead>
              <tr><th>Order</th><th>Date</th><th>Customer</th><th>Course</th><th>Payment</th><th className="right">Action</th></tr>
            </thead>
            <tbody>
              {pending.map((o) => (
                <tr key={o.order_id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{o.order_id}</td>
                  <td>{shortDate(o.order_date)}</td>
                  <td>{o.client?.company || o.client?.name || '—'}</td>
                  <td>{o.course?.course_name || '—'}</td>
                  <td>
                    <span className={`pill ${o.payment_status === 'Paid' ? 'pill-go' : 'pill-tentative'}`}>{o.payment_status}</span>
                  </td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => grant(o.order_id)}>Mark access granted</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {granted.length > 0 && (
        <>
          <h3 style={{ marginBottom: 8 }}>Access granted</h3>
          <div className="card">
            <table>
              <thead>
                <tr><th>Order</th><th>Date</th><th>Customer</th><th>Course</th></tr>
              </thead>
              <tbody>
                {granted.map((o) => (
                  <tr key={o.order_id}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{o.order_id}</td>
                    <td>{shortDate(o.order_date)}</td>
                    <td>{o.client?.company || o.client?.name || '—'}</td>
                    <td>{o.course?.course_name || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
