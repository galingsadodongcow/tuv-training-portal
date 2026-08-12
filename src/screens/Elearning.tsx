'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useElearningPending } from '../hooks/data'
import { Spinner, ErrorNote, Empty } from '../components/ui'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { TableSkeleton } from '../components/Skeleton'
import { shortDate } from '../lib/format'

export default function Elearning() {
  const orders = useElearningPending()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [msg, setMsg] = useState<string | null>(null)

  const grant = async (lineId: string, override?: string) => {
    setMsg(null)
    const { error } = await supabase.from('order_line')
      .update({ access_status: 'Granted', access_granted_date: new Date().toISOString().slice(0, 10) })
      .eq('line_id', lineId)
    if (error) { setMsg(error.message); toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['elearning_pending'] })
    toast.success(override ? `Access granted (override): ${override}` : 'Access granted.')
  }

  // Blocked-on-payment override: unpaid orders normally can't get access, so
  // granting anyway is a destructive/override action — gate it behind the shared
  // confirm dialog with a required reason, the same as voids and refunds.
  const grantAnyway = async (lineId: string) => {
    const res = await confirm({
      title: 'Grant access before payment?',
      body: 'This order is not marked Paid. Granting platform access now overrides the payment gate.',
      confirmLabel: 'Grant anyway', tone: 'danger', reason: 'required', reasonLabel: 'Reason (required)',
    })
    if (!res.ok) return
    if (!res.reason?.trim()) { toast.error('A reason is required to grant before payment.'); return }
    await grant(lineId, res.reason.trim())
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
                    <div className="fill-label">
                      {paid
                        ? 'Payment cleared — ready to grant'
                        : `Awaiting payment — order ${o.order?.payment_status || 'Unpaid'}`}
                    </div>
                  </td>
                  <td className="right">
                    {paid ? (
                      <button className="btn btn-sm" onClick={() => grant(o.line_id)}>
                        Mark access granted
                      </button>
                    ) : (
                      <button className="btn btn-sm btn-danger" onClick={() => grantAnyway(o.line_id)}
                        title="Order is not paid — grant access anyway with a reason">
                        Grant anyway
                      </button>
                    )}
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
