'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useElearningPending } from '../hooks/data'
import { Spinner, ErrorNote, Empty } from '../components/ui'
import { useToast } from '../components/Toast'
import { TableSkeleton } from '../components/Skeleton'
import { shortDate } from '../lib/format'

export default function Elearning() {
  const orders = useElearningPending()
  const qc = useQueryClient()
  const toast = useToast()
  const [msg, setMsg] = useState<string | null>(null)

  const grant = async (lineId: string) => {
    setMsg(null)
    const { error } = await supabase.from('order_line')
      .update({ access_status: 'Granted', access_granted_date: new Date().toISOString().slice(0, 10) })
      .eq('line_id', lineId)
    if (error) { setMsg(error.message); toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['elearning_pending'] })
    toast.success('Access granted.')
  }

  if (orders.isLoading) return <TableSkeleton rows={8} cols={6} />
  if (orders.error) return <ErrorNote error={orders.error} />

  const pending = orders.data.filter((o) => (o.access_status || 'Pending') !== 'Granted')
  const granted = orders.data.filter((o) => o.access_status === 'Granted')

  return (
    <>
      <div className="page-head">
        <div>
          <h1>E-learning access</h1>
          <p>Self-paced orders have no session. Operations grant platform access here after payment.</p>
        </div>
      </div>

      {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

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
              {pending.map((o) => {
                const paid = o.order?.payment_status === 'Paid'
                return (
                <tr key={o.line_id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{o.order?.order_id}</td>
                  <td>{shortDate(o.order?.order_date)}</td>
                  <td>{o.order?.client?.company || o.order?.client?.name || '—'}</td>
                  <td>{o.course?.course_name || '—'}</td>
                  <td>
                    <span className={`pill ${paid ? 'pill-go' : 'pill-tentative'}`}>{o.order?.payment_status || 'Unpaid'}</span>
                  </td>
                  <td className="right">
                    <button className="btn btn-sm" onClick={() => grant(o.line_id)} disabled={!paid}
                      title={paid ? '' : 'Access is granted after the order is paid'}>
                      Mark access granted
                    </button>
                  </td>
                </tr>
                )
              })}
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
                  <tr key={o.line_id}>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>{o.order?.order_id}</td>
                    <td>{shortDate(o.order?.order_date)}</td>
                    <td>{o.order?.client?.company || o.order?.client?.name || '—'}</td>
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
