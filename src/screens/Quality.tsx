'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useNpsSummary, useTrainerQuality, useComplaints, useInvalidate } from '../hooks/data'
import { useToast } from '../components/Toast'
import { Spinner, ErrorNote } from '../components/ui'
import ChartTable, { ChartTableToggle } from '../components/ChartTable'
import { shortDate } from '../lib/format'

const SEVERITY = ['Low', 'Medium', 'High'] as const
const STATUS = ['Open', 'In Progress', 'Resolved', 'Closed'] as const

function Stars({ value }: { value: number | null }) {
  if (value == null) return <span className="fill-label">—</span>
  return <span title={`${value} of 5`}>{'★'.repeat(Math.round(value))}<span style={{ color: 'var(--text-faint)' }}>{'★'.repeat(5 - Math.round(value))}</span> <span className="fill-label">{Number(value).toFixed(1)}</span></span>
}

const statusTone: Record<string, string> = { Open: 'var(--danger)', 'In Progress': 'var(--warning)', Resolved: 'var(--text)', Closed: 'var(--text-faint)' }

export default function Quality() {
  const { profile } = useAuth()
  const nps = useNpsSummary()
  const trainers = useTrainerQuality()
  const complaints = useComplaints()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [tab, setTab] = useState<'overview' | 'trainers' | 'complaints'>('overview')
  const canManage = ['operations', 'business_owner', 'super_admin'].includes(profile?.role as string)

  const [form, setForm] = useState({ subject: '', description: '', severity: 'Medium' })
  const [busy, setBusy] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [npsTable, setNpsTable] = useState(false)

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

  const open = useMemo(() => (complaints.data || []).filter((c: any) => c.status === 'Open' || c.status === 'In Progress'), [complaints.data])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Feedback and quality</h1>
          <p>Post-course sentiment, trainer scores, and the complaint register.</p>
        </div>
        <div className="seg">
          <button className={`seg-btn ${tab === 'overview' ? 'on' : ''}`} onClick={() => setTab('overview')}>Overview</button>
          <button className={`seg-btn ${tab === 'trainers' ? 'on' : ''}`} onClick={() => setTab('trainers')}>Trainers</button>
          <button className={`seg-btn ${tab === 'complaints' ? 'on' : ''}`} onClick={() => setTab('complaints')}>Complaints{open.length ? ` (${open.length})` : ''}</button>
        </div>
      </div>

      {tab === 'overview' && (
        nps.isLoading ? <Spinner label="Loading feedback" /> : nps.error ? <ErrorNote error={nps.error} /> : !nps.data || Number(nps.data.responses) === 0 ? (
          <div className="card"><div className="empty">No feedback captured yet. Record responses from a session's Feedback tab.</div></div>
        ) : (
          <div className="card card-pad">
            <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 14 }}>
              <div className="k-label">Feedback summary</div>
              <ChartTableToggle on={npsTable} onToggle={() => setNpsTable((v) => !v)} />
            </div>
            {npsTable ? (
              <ChartTable
                caption="Feedback summary"
                columns={[{ key: 'metric', label: 'Metric' }, { key: 'value', label: 'Value', align: 'right' }]}
                rows={[
                  { metric: 'NPS', value: nps.data.nps_score ?? '—' },
                  { metric: 'Responses', value: nps.data.responses },
                  { metric: 'Promoters', value: nps.data.promoters },
                  { metric: 'Passives', value: nps.data.passives },
                  { metric: 'Detractors', value: nps.data.detractors },
                  { metric: 'Content score', value: nps.data.avg_content == null ? '—' : `${Number(nps.data.avg_content).toFixed(1)} of 5` },
                  { metric: 'Trainer score', value: nps.data.avg_trainer == null ? '—' : `${Number(nps.data.avg_trainer).toFixed(1)} of 5` },
                ]}
              />
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <div><div className="k-label">NPS</div><div className="k-value" style={{ color: Number(nps.data.nps_score) >= 0 ? 'inherit' : 'var(--danger)' }}>{nps.data.nps_score ?? '—'}</div><div className="fill-label">{nps.data.responses} responses</div></div>
                <div><div className="k-label">Promoters</div><div className="k-value">{nps.data.promoters}</div></div>
                <div><div className="k-label">Passives</div><div className="k-value">{nps.data.passives}</div></div>
                <div><div className="k-label">Detractors</div><div className="k-value">{nps.data.detractors}</div></div>
                <div><div className="k-label">Content</div><div className="k-value"><Stars value={nps.data.avg_content} /></div></div>
                <div><div className="k-label">Trainer</div><div className="k-value"><Stars value={nps.data.avg_trainer} /></div></div>
              </div>
            )}
          </div>
        )
      )}

      {tab === 'trainers' && (
        trainers.isLoading ? <Spinner label="Loading trainer scores" /> : trainers.error ? <ErrorNote error={trainers.error} /> : (
          <div className="card">
            {(trainers.data?.length || 0) === 0 ? <div className="empty">No active trainers.</div> : (
              <table>
                <thead><tr><th>Trainer</th><th className="right">Responses</th><th>Trainer score</th><th>Content</th><th className="right">NPS</th></tr></thead>
                <tbody>
                  {(trainers.data || []).map((t: any) => (
                    <tr key={t.trainer_id}>
                      <td style={{ fontWeight: 600 }}>{t.name} <span className="fill-label">{t.code}</span></td>
                      <td className="right">{t.responses}</td>
                      <td><Stars value={t.avg_trainer} /></td>
                      <td><Stars value={t.avg_content} /></td>
                      <td className="right">{t.nps_score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      )}

      {tab === 'complaints' && (
        <>
          <div className="page-head" style={{ marginBottom: 8 }}>
            <div><h2 style={{ fontSize: 16 }}>Complaint register</h2></div>
            <button className="btn btn-sm" onClick={() => setShowNew((v) => !v)}>{showNew ? 'Cancel' : 'Log complaint'}</button>
          </div>
          {showNew && (
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
      )}
    </>
  )
}
