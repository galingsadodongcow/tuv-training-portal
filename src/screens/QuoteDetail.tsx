'use client'
import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useQuote, useQuoteLines, useQuoteTotal, useCourses, useCourseFees, useInvalidate, useApplicableDiscounts } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { RecordHeader, RecordSection, KeyVal, Badge } from '../components/record'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { php, shortDate } from '../lib/format'
import { lt, LEARNING_TYPES } from '../lib/labels'

const STATUSES = ['Draft', 'Sent', 'Accepted', 'Declined', 'Expired']

export default function QuoteDetail() {
  const id = String(useParams().id)
  const router = useRouter()
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidate()
  const quote = useQuote(id)
  const lines = useQuoteLines(id)
  const total = useQuoteTotal(id)
  const courses = useCourses()
  const fees = useCourseFees()
  const canEdit = ['super_admin', 'sales'].includes(profile?.role as string)

  const [row, setRow] = useState<any>({ course_id: '', modality: 'Face-to-face', seats: 1, unit_price: '' })
  const [busy, setBusy] = useState(false)

  if (quote.isLoading) return <Spinner label="Loading quote" />
  if (quote.error) return <ErrorNote error={quote.error} />
  const q: any = quote.data
  if (!q) return (<><RecordHeader title="Quote not found" back={{ href: '/quotations', label: 'Quotations' }} /><div className="card"><div className="empty">This quote does not exist.</div></div></>)

  const feeFor = (courseId: string, modality: string) => fees.data?.find((f: any) => f.course_id === courseId && f.modality === modality)?.fee_php ?? ''

  const patch = async (fields: any) => {
    const { error } = await supabase.from('quote').update(fields).eq('quote_id', id)
    if (error) toast.error(error.message)
    else invalidate(['quote', 'quotes', 'quote_total'])
  }

  // Declined/Expired are terminal — confirm before writing so a stray select
  // change doesn't quietly close the quote. Other statuses write immediately.
  const changeStatus = async (status: string) => {
    if (status === q.status) return
    if (status === 'Declined' || status === 'Expired') {
      const res = await confirm({ title: `Mark quote as ${status}?`, body: 'This closes the quote.', confirmLabel: status })
      if (!res.ok) return
    }
    patch({ status })
  }

  const addLine = async () => {
    if (!row.course_id) { toast.error('Pick a course.'); return }
    setBusy(true)
    const { error } = await supabase.from('quote_line').insert({
      quote_id: id, course_id: row.course_id, modality: row.modality,
      seats: Number(row.seats) || 1, unit_price: row.unit_price === '' ? 0 : Number(row.unit_price),
    })
    if (error) toast.error(error.message)
    else { setRow({ course_id: '', modality: 'Face-to-face', seats: 1, unit_price: '' }); invalidate(['quote_lines', 'quote_total']) }
    setBusy(false)
  }

  const removeLine = async (lineId: string) => {
    const res = await confirm({ title: 'Remove this line?', confirmLabel: 'Remove', tone: 'danger' })
    if (!res.ok) return
    const { error } = await supabase.from('quote_line').delete().eq('line_id', lineId)
    if (error) toast.error(error.message)
    else invalidate(['quote_lines', 'quote_total'])
  }

  const subtotal = Number(total.data?.subtotal ?? 0)
  const grand = Number(total.data?.total ?? subtotal)

  return (
    <>
      <RecordHeader
        crumbs={[{ href: '/home', label: 'Home' }, { href: '/quotations', label: 'Quotations' }, { label: q.quote_number }]}
        title={`${q.quote_number}`}
        subtitle={`${q.client?.company || q.client?.name || 'No client'}${q.valid_until ? ` · valid to ${shortDate(q.valid_until)}` : ''}`}
        badges={<><Badge tone={q.status === 'Accepted' ? 'ok' : q.status === 'Declined' || q.status === 'Expired' ? 'danger' : 'info'}>{q.status}</Badge>{q.converted_order_id && <Badge tone="neutral">Order {q.converted_order_id}</Badge>}</>}
        actions={
          <div className="toolbar">
            <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print</button>
            {canEdit && !q.converted_order_id && (
              <button className="btn btn-sm" onClick={() => router.push(`/sales-entry?client=${q.client?.client_id || ''}&quote=${id}`)}>Create order</button>
            )}
          </div>
        }
      />

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
          <KeyVal label="Status">
            {canEdit ? (
              <select aria-label="Quote status" value={q.status} onChange={(e) => changeStatus(e.target.value)}>{STATUSES.map((s) => (<option key={s}>{s}</option>))}</select>
            ) : q.status}
          </KeyVal>
          <KeyVal label="Valid until">
            {canEdit ? <input type="date" aria-label="Valid until" defaultValue={q.valid_until || ''} onBlur={(e) => e.target.value !== (q.valid_until || '') && patch({ valid_until: e.target.value || null })} /> : (q.valid_until ? shortDate(q.valid_until) : '—')}
          </KeyVal>
          <KeyVal label="Discount %">
            {canEdit ? <input type="number" aria-label="Discount percent" min="0" max="100" defaultValue={q.discount_pct} onBlur={(e) => Number(e.target.value) !== Number(q.discount_pct) && patch({ discount_pct: Number(e.target.value) || 0 })} style={{ width: 80 }} /> : `${q.discount_pct}%`}
          </KeyVal>
          <KeyVal label="Total">{php(grand)}</KeyVal>
        </div>
      </div>

      <RecordSection title={`Lines (${lines.data?.length || 0})`}>
        {(lines.error || total.error) && (
          <div style={{ marginBottom: 12 }}><ErrorNote error={lines.error || total.error} /></div>
        )}
        <div className="card">
          <table>
            <thead><tr><th>Course</th><th>Type</th><th className="right">Seats</th><th className="right">Unit price</th><th className="right">Line total</th>{canEdit && <th></th>}</tr></thead>
            <tbody>
              {(lines.data || []).map((l: any) => (
                <tr key={l.line_id}>
                  <td>{l.course?.course_name || '—'}</td>
                  <td className="fill-label">{lt(l.modality)}</td>
                  <td className="right">{l.seats}</td>
                  <td className="right">{php(l.unit_price)}</td>
                  <td className="right">{php(l.seats * l.unit_price)}</td>
                  {canEdit && <td className="right"><button className="linkbtn" onClick={() => removeLine(l.line_id)}>Remove</button></td>}
                </tr>
              ))}
              {(lines.data?.length || 0) === 0 && <tr><td colSpan={6}><div className="empty">No lines yet.</div></td></tr>}
            </tbody>
            {(lines.data?.length || 0) > 0 && (
              <tfoot>
                <tr><td colSpan={4} className="right fill-label">Subtotal</td><td className="right">{php(subtotal)}</td>{canEdit && <td></td>}</tr>
                <tr><td colSpan={4} className="right fill-label">After {q.discount_pct}% discount</td><td className="right" style={{ fontWeight: 700 }}>{php(grand)}</td>{canEdit && <td></td>}</tr>
              </tfoot>
            )}
          </table>
        </div>

        {canEdit && !q.converted_order_id && (
          <div className="card card-pad" style={{ marginTop: 12, maxWidth: 720 }}>
            <div className="k-label" style={{ marginBottom: 8 }}>Add a line</div>
            <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto', alignItems: 'end', gap: 8 }}>
              <label className="field"><span>Course</span>
                <select value={row.course_id} onChange={(e) => { const cid = e.target.value; setRow({ ...row, course_id: cid, unit_price: feeFor(cid, row.modality) }) }}>
                  <option value="">Select…</option>
                  {courses.data?.map((c: any) => (<option key={c.course_id} value={c.course_id}>{c.course_name}</option>))}
                </select>
              </label>
              <label className="field"><span>Type</span>
                <select value={row.modality} onChange={(e) => { const m = e.target.value; setRow({ ...row, modality: m, unit_price: feeFor(row.course_id, m) }) }}>
                  {LEARNING_TYPES.map((m) => (<option key={m} value={m}>{lt(m)}</option>))}
                </select>
              </label>
              <label className="field"><span>Seats</span><input type="number" min="1" value={row.seats} onChange={(e) => setRow({ ...row, seats: e.target.value })} /></label>
              <label className="field"><span>Unit price</span><input type="number" min="0" value={row.unit_price} onChange={(e) => setRow({ ...row, unit_price: e.target.value })} /></label>
              <button className="btn btn-sm" onClick={addLine} disabled={busy}>Add</button>
            </div>
            <DiscountHint
              course={courses.data?.find((c: any) => c.course_id === row.course_id)}
              country={q.country}
              seats={Number(row.seats) || 1}
              unitPrice={row.unit_price === '' ? null : Number(row.unit_price)}
              onApply={(p) => setRow((r: any) => ({ ...r, unit_price: p }))}
            />
          </div>
        )}
      </RecordSection>
    </>
  )
}

// Advisory: shows the best applicable discount rule for the line being added and
// offers to apply it to the unit price. Never changes anything on its own.
function DiscountHint({ course, country, seats, unitPrice, onApply }: {
  course: any; country?: string | null; seats: number; unitPrice: number | null; onApply: (p: number) => void
}) {
  const discounts = useApplicableDiscounts(course?.course_id, course?.training_type, country, seats)
  if (!course?.course_id) return null
  const best = (discounts.data || [])[0]
  if (!best) return null
  const pct = best.discount_pct != null ? Number(best.discount_pct) : null
  const amt = best.discount_amount != null ? Number(best.discount_amount) : null
  const discounted = unitPrice != null
    ? pct != null ? Math.round(unitPrice * (1 - pct / 100)) : amt != null ? Math.max(0, unitPrice - amt) : null
    : null
  return (
    <div className="notice notice-info" style={{ marginTop: 10 }}>
      <strong>{best.label}</strong> applies at {seats} seat{seats === 1 ? '' : 's'} — {pct != null ? `${pct}% off` : `${php(amt)} off`}.
      {discounted != null && unitPrice != null && (
        <> Suggested unit price {php(discounted)} (from {php(unitPrice)}). <button className="btn btn-ghost btn-sm" onClick={() => onApply(discounted)}>Apply</button></>
      )}
    </div>
  )
}
