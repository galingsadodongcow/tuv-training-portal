'use client'
import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useInquiries, useCourses, useSalespeople, useInvalidate } from '../hooks/data'
import { TableSkeleton } from '../components/Skeleton'
import { ErrorNote } from '../components/ui'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { shortDate, php } from '../lib/format'
import { inquiryHealth } from '../lib/leadHealth'

// The lead pipeline, left to right. Matches the inquiry_status enum.
const STAGES = ['Received', 'Responded', 'RFQ or P Sent', 'Awaiting Feedback', 'Closed Won', 'Closed Lost']
const OPEN_STAGES = ['Received', 'Responded', 'RFQ or P Sent', 'Awaiting Feedback']
const OFFERINGS = ['Public', 'In-house']
const SOURCES = ['Website', 'Referral', 'Event', 'Repeat client', 'Cold outreach', 'Other']

const emptyForm = { company: '', contact: '', email: '', phone: '', course_id: '', pax: '', offering_type: 'Public', sales_id: '', est_value: '', probability: '', expected_close: '', source: '' }

export default function Inquiries() {
  const { profile } = useAuth()
  const inquiries = useInquiries()
  const courses = useCourses()
  const people = useSalespeople()
  const invalidate = useInvalidate()
  const toast = useToast()
  const confirm = useConfirm()
  const isAdmin = profile?.role === 'super_admin'

  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<any>(emptyForm)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const byStage = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const s of STAGES) m[s] = []
    for (const q of inquiries.data || []) (m[q.status] ||= []).push(q)
    return m
  }, [inquiries.data])

  const createInquiry = async () => {
    const salesId = isAdmin ? form.sales_id : profile?.sales_id
    if (!salesId) { toast.error('Pick a salesperson for this inquiry.'); return }
    if (!form.company.trim()) { toast.error('Company is required.'); return }
    setBusy(true)
    const body: any = {
      sales_id: salesId,
      company: form.company.trim(),
      contact: form.contact.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      course_id: form.course_id || null,
      pax: form.pax === '' ? null : Number(form.pax),
      offering_type: form.offering_type,
      est_value: form.est_value === '' ? null : Number(form.est_value),
      probability: form.probability === '' ? null : Number(form.probability),
      expected_close: form.expected_close || null,
      source: form.source || null,
      status: 'Received',
    }
    const missingColumn = (e: any) => !!e && (e.code === '42703' || /column .* does not exist/i.test(e.message || ''))
    let { error } = await supabase.from('inquiry').insert(body)
    if (error && missingColumn(error)) {
      const { est_value, probability, expected_close, source, ...base } = body
      ;({ error } = await supabase.from('inquiry').insert(base))
    }
    if (error) toast.error(error.message)
    else { toast.success('Inquiry added.'); setForm(emptyForm); setCreating(false); invalidate(['inquiries']) }
    setBusy(false)
  }

  const move = async (id: string, status: string) => {
    const { error } = await supabase.from('inquiry').update({ status }).eq('inquiry_id', id)
    if (error) toast.error(error.message)
    else invalidate(['inquiries'])
  }

  const markLost = async (id: string) => {
    const res = await confirm({ title: 'Mark this lead as lost?', confirmLabel: 'Mark lost', tone: 'danger', reason: 'optional', reasonLabel: 'Reason lost' })
    if (!res.ok) return
    const { error } = await supabase.from('inquiry').update({ status: 'Closed Lost', lost_reason: res.reason || null }).eq('inquiry_id', id)
    if (error) toast.error(error.message)
    else invalidate(['inquiries'])
  }

  const weighted = (inquiries.data || [])
    .filter((q: any) => OPEN_STAGES.includes(q.status))
    .reduce((n: number, q: any) => n + (Number(q.est_value) || 0) * ((Number(q.probability) || 0) / 100), 0)

  if (inquiries.isLoading) return <TableSkeleton rows={6} cols={5} />
  if (inquiries.error) return <ErrorNote error={inquiries.error} />

  const total = (inquiries.data || []).length
  const won = byStage['Closed Won'].length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Inquiry pipeline</h1>
          <p>{total} inquir{total === 1 ? 'y' : 'ies'}, {won} closed won. Weighted open pipeline {php(weighted)}. {isAdmin ? 'You see the whole team.' : 'You see your own.'}</p>
        </div>
        <div className="toolbar">
          <button className="btn" onClick={() => setCreating((c) => !c)}>{creating ? 'Close' : '+ New inquiry'}</button>
        </div>
      </div>

      {creating && (
        <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 720 }}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Company</span><input value={form.company} onChange={set('company')} /></label>
            <label className="field"><span>Contact</span><input value={form.contact} onChange={set('contact')} /></label>
            <label className="field"><span>Email</span><input type="email" value={form.email} onChange={set('email')} /></label>
            <label className="field"><span>Phone</span><input value={form.phone} onChange={set('phone')} /></label>
            <label className="field"><span>Course of interest</span>
              <select value={form.course_id} onChange={set('course_id')}>
                <option value="">Not specified</option>
                {courses.data?.map((c: any) => (<option key={c.course_id} value={c.course_id}>{c.course_name}</option>))}
              </select>
            </label>
            <label className="field"><span>Offering</span>
              <select value={form.offering_type} onChange={set('offering_type')}>
                {OFFERINGS.map((o) => (<option key={o}>{o}</option>))}
              </select>
            </label>
            <label className="field"><span>Estimated pax</span><input type="number" min="1" value={form.pax} onChange={set('pax')} /></label>
            <label className="field"><span>Estimated value (PHP)</span><input type="number" min="0" value={form.est_value} onChange={set('est_value')} /></label>
            <label className="field"><span>Win probability %</span><input type="number" min="0" max="100" value={form.probability} onChange={set('probability')} /></label>
            <label className="field"><span>Expected close</span><input type="date" value={form.expected_close} onChange={set('expected_close')} /></label>
            <label className="field"><span>Source</span>
              <select value={form.source} onChange={set('source')}>
                <option value="">Not specified</option>
                {SOURCES.map((s) => (<option key={s}>{s}</option>))}
              </select>
            </label>
            {isAdmin && (
              <label className="field"><span>Salesperson</span>
                <select value={form.sales_id} onChange={set('sales_id')}>
                  <option value="">Select…</option>
                  {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
                </select>
              </label>
            )}
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={createInquiry} disabled={busy}>{busy ? 'Adding…' : 'Add inquiry'}</button>
          </div>
        </div>
      )}

      <div className="pipeline">
        {STAGES.map((stage) => (
          <div key={stage} className="pipeline-col">
            <div className="pipeline-head">
              {stage} <span className="pipeline-count">{byStage[stage].length}</span>
            </div>
            <div className="pipeline-body">
              {byStage[stage].length === 0 && <div className="pipeline-empty">—</div>}
              {byStage[stage].map((q: any) => {
                const i = STAGES.indexOf(stage)
                const h = inquiryHealth(q)
                return (
                  <div key={q.inquiry_id} className="pipeline-card">
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span>{q.company}</span>
                      {h && <span className={`pill ${h.cls}`}>{h.label}</span>}
                    </div>
                    <div className="fill-label">{q.course?.course_name || 'No course yet'}</div>
                    <div className="fill-label">
                      {q.contact || '—'}{q.pax ? ` · ${q.pax} pax` : ''} · {q.offering_type}
                    </div>
                    {(q.est_value || q.probability) && (
                      <div className="fill-label">{q.est_value ? php(q.est_value) : '—'}{q.probability != null ? ` · ${q.probability}%` : ''}{q.expected_close ? ` · ${shortDate(q.expected_close)}` : ''}</div>
                    )}
                    {stage === 'Closed Lost' && q.lost_reason && <div className="fill-label" style={{ color: 'var(--danger)' }}>Lost: {q.lost_reason}</div>}
                    <div className="fill-label">{q.salesperson?.name || '—'} · {shortDate(q.inquiry_date)}{q.source ? ` · ${q.source}` : ''}</div>
                    <div className="toolbar" style={{ gap: 4, marginTop: 6 }}>
                      {stage === 'Closed Lost' ? (
                        <button className="btn btn-ghost btn-sm" title="Reopen" onClick={() => move(q.inquiry_id, 'Received')}>Reopen</button>
                      ) : (
                        <>
                          {i > 0 && <button className="btn btn-ghost btn-sm" title="Move back" aria-label="Move back a stage" onClick={() => move(q.inquiry_id, STAGES[i - 1])}>‹</button>}
                          {i < 4 && <button className="btn btn-sm" title="Advance" aria-label="Advance a stage" onClick={() => move(q.inquiry_id, STAGES[i + 1])}>›</button>}
                          {OPEN_STAGES.includes(stage) && <button className="btn btn-ghost btn-sm" title="Mark lost" onClick={() => markLost(q.inquiry_id)}>Lost</button>}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
