'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useOrderAr, useInvoices, usePayments, useInvalidate } from '../hooks/data'
import { useToast } from './Toast'
import { useConfirm } from './Confirm'
import { php, shortDate } from '../lib/format'

const METHODS = ['Bank transfer', 'Credit card', 'Cheque', 'Cash']

// Accounts receivable for one order: invoices raised, payments recorded, and the
// balance. Recording a payment updates the order's payment status through a
// database trigger.
export default function ReceivablePanel({ orderId, totalAmount }: { orderId: string; totalAmount: number }) {
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidate()
  const ar = useOrderAr(orderId)
  const invoices = useInvoices(orderId)
  const payments = usePayments(orderId)
  const canManage = ['operations', 'super_admin', 'business_owner'].includes(profile?.role as string)

  const [inv, setInv] = useState<any>({ open: false, amount: '', due_date: '', invoice_number: '' })
  const [pay, setPay] = useState<any>({ open: false, amount: '', paid_date: new Date().toISOString().slice(0, 10), method: 'Bank transfer', reference: '' })
  const [busy, setBusy] = useState(false)

  const paid = Number(ar.data?.paid ?? 0)
  const invoiced = Number(ar.data?.invoiced ?? 0)
  const balance = ar.data ? Number(ar.data.balance) : totalAmount - paid
  const due = ar.data?.due_date
  const overdueDays = due && balance > 0 ? Math.floor((Date.now() - +new Date(due)) / 86400000) : null

  const addInvoice = async () => {
    const amt = Number(inv.amount)
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter an invoice amount.'); return }
    setBusy(true)
    const { error } = await supabase.from('invoice').insert({
      order_id: orderId, amount: amt, due_date: inv.due_date || null,
      invoice_number: inv.invoice_number.trim() || null, created_by: profile?.user_id,
    })
    if (error) toast.error(error.message)
    else { toast.success('Invoice added.'); setInv({ open: false, amount: '', due_date: '', invoice_number: '' }); invalidate(['invoices', 'order_ar']) }
    setBusy(false)
  }

  const recordPayment = async () => {
    const amt = Number(pay.amount)
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a payment amount.'); return }
    setBusy(true)
    const { error } = await supabase.from('payment').insert({
      order_id: orderId, amount: amt, paid_date: pay.paid_date, method: pay.method,
      reference: pay.reference.trim() || null, created_by: profile?.user_id,
    })
    if (error) toast.error(error.message)
    else {
      toast.success('Payment recorded.')
      setPay({ open: false, amount: '', paid_date: new Date().toISOString().slice(0, 10), method: 'Bank transfer', reference: '' })
      invalidate(['payments', 'order_ar', 'order', 'orders', 'fulfillment_queue'])
    }
    setBusy(false)
  }

  const removePayment = async (pid: string) => {
    const res = await confirm({ title: 'Remove this payment?', body: 'The balance and payment status will be recalculated.', confirmLabel: 'Remove', tone: 'danger' })
    if (!res.ok) return
    const { error } = await supabase.from('payment').delete().eq('payment_id', pid)
    if (error) toast.error(error.message)
    else { toast.success('Payment removed.'); invalidate(['payments', 'order_ar', 'order', 'orders', 'fulfillment_queue']) }
  }

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div><div className="k-label">Order total</div><div className="k-value" style={{ fontSize: 18 }}>{php(totalAmount)}</div></div>
        <div><div className="k-label">Invoiced</div><div className="k-value" style={{ fontSize: 18 }}>{php(invoiced)}</div></div>
        <div><div className="k-label">Paid</div><div className="k-value" style={{ fontSize: 18 }}>{php(paid)}</div></div>
        <div><div className="k-label">Balance</div><div className="k-value" style={{ fontSize: 18, color: balance > 0 ? 'var(--warning)' : 'var(--success, var(--accent))' }}>{php(balance)}</div></div>
        <div><div className="k-label">Due</div><div className="fill-label" style={{ marginTop: 4 }}>{due ? shortDate(due) : '—'}{overdueDays != null && overdueDays > 0 ? ` · ${overdueDays}d overdue` : ''}</div></div>
      </div>

      {canManage && (
        <div className="toolbar" style={{ marginBottom: 10, gap: 6 }}>
          <button className="btn btn-sm" onClick={() => setPay((p: any) => ({ ...p, open: !p.open }))}>{pay.open ? 'Close' : 'Record payment'}</button>
          <button className="btn btn-ghost btn-sm" onClick={() => setInv((i: any) => ({ ...i, open: !i.open }))}>{inv.open ? 'Close' : '+ Invoice'}</button>
        </div>
      )}

      {canManage && pay.open && (
        <div className="card card-pad" style={{ marginBottom: 12, maxWidth: 560 }}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Amount</span><input type="number" min="0" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></label>
            <label className="field"><span>Date</span><input type="date" value={pay.paid_date} onChange={(e) => setPay({ ...pay, paid_date: e.target.value })} /></label>
            <label className="field"><span>Method</span><select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{METHODS.map((m) => (<option key={m}>{m}</option>))}</select></label>
            <label className="field"><span>Reference</span><input value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></label>
          </div>
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={recordPayment} disabled={busy}>{busy ? 'Saving…' : 'Save payment'}</button>
        </div>
      )}

      {canManage && inv.open && (
        <div className="card card-pad" style={{ marginBottom: 12, maxWidth: 560 }}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label className="field"><span>Amount</span><input type="number" min="0" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} /></label>
            <label className="field"><span>Due date</span><input type="date" value={inv.due_date} onChange={(e) => setInv({ ...inv, due_date: e.target.value })} /></label>
            <label className="field"><span>Invoice no.</span><input value={inv.invoice_number} onChange={(e) => setInv({ ...inv, invoice_number: e.target.value })} /></label>
          </div>
          <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={addInvoice} disabled={busy}>{busy ? 'Saving…' : 'Add invoice'}</button>
        </div>
      )}

      {(invoices.data?.length || 0) > 0 && (
        <>
          <div className="k-label" style={{ margin: '4px 0 6px' }}>Invoices</div>
          <table style={{ marginBottom: 14 }}>
            <thead><tr><th>Number</th><th>Issued</th><th>Due</th><th className="right">Amount</th><th>Status</th></tr></thead>
            <tbody>
              {invoices.data.map((i: any) => (
                <tr key={i.invoice_id}>
                  <td>{i.invoice_number || '—'}</td>
                  <td className="fill-label">{shortDate(i.issue_date)}</td>
                  <td className="fill-label">{i.due_date ? shortDate(i.due_date) : '—'}</td>
                  <td className="right">{php(i.amount)}</td>
                  <td className="fill-label">{i.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(payments.data?.length || 0) > 0 && (
        <>
          <div className="k-label" style={{ margin: '4px 0 6px' }}>Payments</div>
          <table>
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="right">Amount</th>{canManage && <th></th>}</tr></thead>
            <tbody>
              {payments.data.map((p: any) => (
                <tr key={p.payment_id}>
                  <td className="fill-label">{shortDate(p.paid_date)}</td>
                  <td className="fill-label">{p.method || '—'}</td>
                  <td className="fill-label">{p.reference || '—'}</td>
                  <td className="right">{php(p.amount)}</td>
                  {canManage && <td className="right"><button className="linkbtn" onClick={() => removePayment(p.payment_id)}>Remove</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(invoices.data?.length || 0) === 0 && (payments.data?.length || 0) === 0 && (
        <div className="muted fill-label">No invoices or payments recorded yet.</div>
      )}
    </div>
  )
}
