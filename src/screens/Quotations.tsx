'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useQuotes, useClients, useSalespeople, useInvalidate } from '../hooks/data'
import { TableSkeleton } from '../components/Skeleton'
import { ErrorNote } from '../components/ui'
import { useToast } from '../components/Toast'
import { shortDate } from '../lib/format'

const STATUS_TONE: Record<string, string> = { Draft: 'pill-tentative', Sent: 'pill-webshop', Accepted: 'pill-go', Declined: 'pill-cancelled', Expired: 'pill-cancelled' }

export default function Quotations() {
  const router = useRouter()
  const { profile } = useAuth()
  const quotes = useQuotes()
  const clients = useClients()
  const people = useSalespeople()
  const invalidate = useInvalidate()
  const toast = useToast()
  const isAdmin = profile?.role === 'super_admin'
  const canEdit = ['super_admin', 'sales'].includes(profile?.role as string)

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<any>({ client_id: '', valid_until: '', sales_id: '' })
  const [busy, setBusy] = useState(false)

  const create = async () => {
    if (!form.client_id) { toast.error('Pick a client.'); return }
    const salesId = isAdmin ? (form.sales_id || null) : profile?.sales_id
    setBusy(true)
    const { data, error } = await supabase.from('quote').insert({
      client_id: form.client_id, valid_until: form.valid_until || null, sales_id: salesId, created_by: profile?.user_id,
    }).select('quote_id').single()
    if (error) toast.error(error.message)
    else { invalidate(['quotes']); router.push(`/quotations/${data.quote_id}`) }
    setBusy(false)
  }

  if (quotes.isLoading) return <TableSkeleton rows={6} cols={5} />
  if (quotes.error) return <ErrorNote error={quotes.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Quotations</h1>
          <p>Formal quotes with line items and a validity date. Turn an accepted quote into an order.</p>
        </div>
        {canEdit && <div className="toolbar"><button className="btn" onClick={() => setCreating((c) => !c)}>{creating ? 'Close' : '+ New quote'}</button></div>}
      </div>

      {creating && (
        <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 640 }}>
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
            <label className="field"><span>Client</span>
              <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
                <option value="">Select a client…</option>
                {clients.data?.map((c: any) => (<option key={c.client_id} value={c.client_id}>{c.company || c.name}</option>))}
              </select>
            </label>
            <label className="field"><span>Valid until</span><input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></label>
            {isAdmin && (
              <label className="field"><span>Salesperson</span>
                <select value={form.sales_id} onChange={(e) => setForm({ ...form, sales_id: e.target.value })}>
                  <option value="">Unassigned</option>
                  {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
                </select>
              </label>
            )}
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}><button className="btn btn-sm" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create quote'}</button></div>
        </div>
      )}

      <div className="card">
        {(quotes.data?.length || 0) === 0 ? (
          <div className="empty">No quotes yet.</div>
        ) : (
          <table>
            <thead><tr><th>Number</th><th>Client</th><th>Status</th><th>Valid until</th><th>Owner</th><th>Created</th></tr></thead>
            <tbody>
              {quotes.data.map((q: any) => (
                <tr key={q.quote_id} style={{ cursor: 'pointer' }} role="button" tabIndex={0}
                  aria-label={`Open quote ${q.quote_number}`}
                  onClick={() => router.push(`/quotations/${q.quote_id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/quotations/${q.quote_id}`) } }}>
                  <td style={{ fontWeight: 600 }}>{q.quote_number}</td>
                  <td className="fill-label">{q.client?.company || q.client?.name || '—'}</td>
                  <td><span className={`pill ${STATUS_TONE[q.status] || 'pill-webshop'}`}>{q.status}</span></td>
                  <td className="fill-label">{q.valid_until ? shortDate(q.valid_until) : '—'}</td>
                  <td className="fill-label">{q.salesperson?.name || '—'}</td>
                  <td className="fill-label">{shortDate(q.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
