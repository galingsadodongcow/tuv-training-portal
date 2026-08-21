'use client'
import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useComplaints, useInvalidate } from '../hooks/data'
import { useToast } from '../components/Toast'
import { Spinner, ErrorNote } from '../components/ui'
import { shortDate } from '../lib/format'

const SEVERITY = ['Low', 'Medium', 'High'] as const
const STATUS = ['Open', 'In Progress', 'Resolved', 'Closed'] as const
const statusTone: Record<string, string> = { Open: 'var(--danger)', 'In Progress': 'var(--warning)', Resolved: 'var(--text)', Closed: 'var(--text-faint)' }

// The complaint register — a record list, not an analytics view (it moved out of
// the Feedback/Quality tab in the third-pass consolidation). Ops/BO/super_admin
// can log and progress complaints; management sees them read-only. Writes go
// straight to the `complaint` table, gated by RLS.
export default function Complaints() {
  const { profile } = useAuth()
  const complaints = useComplaints()
  const invalidate = useInvalidate()
  const toast = useToast()
  const canManage = ['operations', 'business_owner', 'super_admin'].includes(profile?.role as string)

  const [form, setForm] = useState({ subject: '', description: '', severity: 'Medium' })
  const [busy, setBusy] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)

  const addComplaint = async () => {
    if (!form.subject.trim()) return
    setBusy('new')
    const { error } = await supabase.from('complaint').insert({
      subject: form.subject.trim(),
      description: form.description.trim() || null,
      severity: form.severity,
      opened_by: profile?.user_id || null,
    })
    setBusy(null)
    if (error) toast.error(error.message)
    else { setForm({ subject: '', description: '', severity: 'Medium' }); setShowNew(false); invalidate(['complaints']); toast.success('Complaint logged.') }
  }

  const setComplaintStatus = async (id: string, status: string) => {
    setBusy(id)
    const { error } = await supabase.from('complaint').update({ status }).eq('complaint_id', id)
    setBusy(null)
    if (error) toast.error(error.message)
    else { invalidate(['complaints']); toast.success('Updated.') }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Complaint register</h1>
          <p>Customer complaints and where each one stands. Feedback and trainer scores live in <Link href="/analytics?tab=quality">Analytics</Link>.</p>
        </div>
        {canManage && <button className="btn btn-sm" onClick={() => setShowNew((v) => !v)}>{showNew ? 'Cancel' : 'Log complaint'}</button>}
      </div>

      {showNew && canManage && (
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input aria-label="Complaint subject" placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <textarea aria-label="Complaint description" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            <div className="toolbar">
              <select aria-label="Complaint severity" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
                {SEVERITY.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn btn-sm" disabled={busy === 'new' || !form.subject.trim()} onClick={addComplaint}>Save</button>
            </div>
          </div>
        </div>
      )}

      {complaints.isLoading ? <Spinner /> : complaints.error ? <ErrorNote error={complaints.error} /> : (
        <div className="card">
          {(complaints.data?.length || 0) === 0 ? <div className="empty">No complaints logged.</div> : (
            <table>
              <thead><tr><th>Subject</th><th>Severity</th><th>Context</th><th>Opened</th><th>Status</th></tr></thead>
              <tbody>
                {(complaints.data || []).map((c: any) => (
                  <tr key={c.complaint_id} style={{ opacity: busy === c.complaint_id ? 0.5 : 1 }}>
                    <td style={{ fontWeight: 600 }}>{c.subject}{c.description && <div className="fill-label" style={{ fontWeight: 400 }}>{c.description}</div>}</td>
                    <td><span className="pill" style={{ borderColor: c.severity === 'High' ? 'var(--danger)' : undefined }}>{c.severity}</span></td>
                    <td className="fill-label">
                      {c.client?.company || '—'}
                      {c.schedule && <> · <Link href={`/session/${c.schedule_id}`}>{c.schedule.course?.course_name}</Link></>}
                      {c.order_id && <> · <Link href={`/orders/${c.order_id}`}>{c.order_id}</Link></>}
                    </td>
                    <td className="fill-label">{shortDate(c.opened_at)}</td>
                    <td>
                      {canManage ? (
                        <select aria-label={`Status for ${c.subject}`} value={c.status} onChange={(e) => setComplaintStatus(c.complaint_id, e.target.value)} style={{ color: statusTone[c.status] }}>
                          {STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : <span style={{ color: statusTone[c.status] }}>{c.status}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}
