'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useOrderAr, useInvoices, usePayments, useRefunds, useVoidPayment, useRefundPayment, useInvalidate } from '../hooks/data'
import { useToast } from './Toast'
import { useConfirm } from './Confirm'
import { Spinner, ErrorNote } from './ui'
import { Badge } from './record'
import { php, shortDate } from '../lib/format'

const METHODS = ['Bank transfer', 'Credit card', 'Cheque', 'Cash']

// Accounts receivable for one order: invoices raised, payments recorded, refunds
// issued, and the balance. Payments are immutable — they are never deleted; a
// business owner or super admin voids or refunds them, each with a persisted
// reason. Recording a payment updates the order's payment status via a DB trigger.
export default function ReceivablePanel({ orderId, totalAmount }: { orderId: string; totalAmount: number }) {
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidate()
  const ar = useOrderAr(orderId)
  const invoices = useInvoices(orderId)
  const payments = usePayments(orderId)
  const refunds = useRefunds(orderId)
  const voidPayment = useVoidPayment()
  const refundPayment = useRefundPayment()
  // Coordinator / operations / business owner / super admin may record + confirm.
  const canManage = ['operations', 'super_admin', 'business_owner', 'coordinator'].includes(profile?.role as string)
  // Only the business owner / super admin may void or refund (money out).
  const canReverse = ['business_owner', 'super_admin'].includes(profile?.role as string)

  const [inv, setInv] = useState<any>({ open: false, amount: '', due_date: '', invoice_number: '' })
  const [pay, setPay] = useState<any>({ open: false, amount: '', paid_date: new Date().toISOString().slice(0, 10), method: 'Bank transfer', reference: '' })
  const [ref, setRef] = useState<any>(null) // inline refund form: { paymentId, max, amount, reason }
  const [busy, setBusy] = useState(false)

  const paid = Number(ar.data?.paid ?? 0)
  const invoiced = Number(ar.data?.invoiced ?? 0)
  const balance = ar.data ? Number(ar.data.balance) : totalAmount - paid
  const due = ar.data?.due_date
  const overdueDays = due && balance > 0 ? Math.floor((Date.now() - +new Date(due)) / 86400000) : null
  const refunded = (refunds.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0)

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
    // Soft guard: warn on an apparent overpayment, but let it through — refunds,
    // credits, and split payments are legitimate reasons to exceed the balance.
    if (balance > 0 && amt > balance) {
      const res = await confirm({ title: 'Payment exceeds the balance', body: `This payment of ${php(amt)} is more than the outstanding balance of ${php(balance)}. Record it anyway?`, confirmLabel: 'Record anyway' })
      if (!res.ok) return
    }
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

  const voidOne = async (p: any) => {
    const res = await confirm({
      title: 'Void this payment?',
      body: `Voiding keeps the record but removes ${php(p.amount)} from the paid balance. This cannot be undone.`,
      confirmLabel: 'Void payment', tone: 'danger', reason: 'optional', reasonLabel: 'Reason (required)',
    })
    if (!res.ok) return
    if (!res.reason?.trim()) { toast.error('A reason is required to void a payment.'); return }
    try {
      await voidPayment.mutateAsync({ paymentId: p.payment_id, reason: res.reason.trim() })
      toast.success('Payment voided.')
    } catch (e: any) { toast.error(e.message || 'Could not void the payment.') }
  }

  const submitRefund = async () => {
    const amt = Number(ref.amount)
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Enter a refund amount.'); return }
    if (amt > ref.max) { toast.error(`Refund cannot exceed the payment of ${php(ref.max)}.`); return }
    if (!ref.reason.trim()) { toast.error('A reason is required to refund.'); return }
    try {
      await refundPayment.mutateAsync({ paymentId: ref.paymentId, amount: amt, reason: ref.reason.trim() })
      toast.success('Refund recorded.')
      setRef(null)
    } catch (e: any) { toast.error(e.message || 'Could not record the refund.') }
  }

  if (ar.isLoading || invoices.isLoading || payments.isLoading) return <Spinner label="Loading receivables" />
  const arError = ar.error || invoices.error || payments.error
  if (arError) return <ErrorNote error={arError} />

  return (
    <div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 12 }}>
        <div><div className="k-label">Order total</div><div className="k-value" style={{ fontSize: 18 }}>{php(totalAmount)}</div></div>
        <div><div className="k-label">Invoiced</div><div className="k-value" style={{ fontSize: 18 }}>{php(invoiced)}</div></div>
        <div><div className="k-label">Paid</div><div className="k-value" style={{ fontSize: 18 }}>{php(paid)}</div></div>
        {refunded > 0 && <div><div className="k-label">Refunded</div><div className="k-value" style={{ fontSize: 18, color: 'var(--warning)' }}>{php(refunded)}</div></div>}
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
        <div className="subform" style={{ marginBottom: 12, maxWidth: 560 }}>
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
        <div className="subform" style={{ marginBottom: 12, maxWidth: 560 }}>
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
          <div className="scroll-x">
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
          </div>
        </>
      )}

      {(payments.data?.length || 0) > 0 && (
        <>
          <div className="k-label" style={{ margin: '4px 0 6px' }}>Payments</div>
          <div className="scroll-x">
          <table>
            <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th className="right">Amount</th><th>Status</th>{canReverse && <th></th>}</tr></thead>
            <tbody>
              {payments.data.map((p: any) => {
                const voided = p.status === 'Voided'
                return (
                <tr key={p.payment_id} style={voided ? { opacity: 0.55 } : undefined}>
                  <td className="fill-label">{shortDate(p.paid_date)}</td>
                  <td className="fill-label">{p.method || '—'}</td>
                  <td className="fill-label">{p.reference || '—'}</td>
                  <td className="right" style={voided ? { textDecoration: 'line-through' } : undefined}>{php(p.amount)}</td>
                  <td><Badge tone={voided ? 'neutral' : p.status === 'Pending' ? 'warn' : 'ok'}>{p.status || 'Confirmed'}</Badge></td>
                  {canReverse && (
                    <td className="right">
                      {!voided && (
                        <span className="toolbar" style={{ gap: 8, justifyContent: 'flex-end' }}>
                          <button className="linkbtn" onClick={() => setRef({ paymentId: p.payment_id, max: Number(p.amount), amount: String(p.amount), reason: '' })}>Refund</button>
                          <button className="linkbtn" onClick={() => voidOne(p)}>Void</button>
                        </span>
                      )}
                    </td>
                  )}
                </tr>
              )})}
            </tbody>
          </table>
          </div>
          {ref && (
            <div className="subform" style={{ margin: '10px 0', maxWidth: 480 }}>
              <div className="k-label" style={{ marginBottom: 8 }}>Refund a payment</div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="field"><span>Amount (max {php(ref.max)})</span><input type="number" min="0" max={ref.max} value={ref.amount} onChange={(e) => setRef({ ...ref, amount: e.target.value })} /></label>
                <label className="field"><span>Reason (required)</span><input value={ref.reason} onChange={(e) => setRef({ ...ref, reason: e.target.value })} /></label>
              </div>
              <div className="toolbar" style={{ marginTop: 8 }}>
                <button className="btn btn-sm" onClick={submitRefund} disabled={refundPayment.isPending}>{refundPayment.isPending ? 'Saving…' : 'Record refund'}</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setRef(null)}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {(refunds.data?.length || 0) > 0 && (
        <>
          <div className="k-label" style={{ margin: '10px 0 6px' }}>Refunds</div>
          <div className="scroll-x">
          <table>
            <thead><tr><th>Date</th><th>Reason</th><th className="right">Amount</th></tr></thead>
            <tbody>
              {refunds.data.map((r: any) => (
                <tr key={r.refund_id}>
                  <td className="fill-label">{shortDate(r.created_at)}</td>
                  <td className="fill-label">{r.reason || '—'}</td>
                  <td className="right">{php(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      )}

      {(invoices.data?.length || 0) === 0 && (payments.data?.length || 0) === 0 && (
        <div className="muted fill-label">No invoices or payments recorded yet.</div>
      )}
    </div>
  )
}
