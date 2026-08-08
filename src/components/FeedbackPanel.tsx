'use client'
import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSessionFeedback, useInvalidate } from '../hooks/data'
import { useToast } from './Toast'
import { Spinner } from './ui'
import { shortDate } from '../lib/format'

const RATINGS = [
  { key: 'content_rating', label: 'Content' },
  { key: 'trainer_rating', label: 'Trainer' },
  { key: 'venue_rating', label: 'Venue' },
] as const

export default function FeedbackPanel({ scheduleId }: { scheduleId: string }) {
  const { profile } = useAuth()
  const list = useSessionFeedback(scheduleId)
  const invalidate = useInvalidate()
  const toast = useToast()
  const canManage = ['operations', 'business_owner', 'super_admin'].includes(profile?.role as string)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState<any>({ nps: '', content_rating: '', trainer_rating: '', venue_rating: '', comments: '' })

  const rows = list.data || []
  const summary = useMemo(() => {
    const withNps = rows.filter((r: any) => r.nps != null)
    const promoters = withNps.filter((r: any) => r.nps >= 9).length
    const detractors = withNps.filter((r: any) => r.nps <= 6).length
    const nps = withNps.length ? Math.round((promoters - detractors) * 100 / withNps.length) : null
    const avg = (k: string) => {
      const v = rows.filter((r: any) => r[k] != null)
      return v.length ? (v.reduce((a: number, r: any) => a + Number(r[k]), 0) / v.length).toFixed(1) : '—'
    }
    return { count: rows.length, nps, content: avg('content_rating'), trainer: avg('trainer_rating') }
  }, [rows])

  const submit = async () => {
    const nps = form.nps === '' ? null : Number(form.nps)
    if (nps != null && (nps < 0 || nps > 10)) { toast.error('NPS must be 0 to 10.'); return }
    setBusy(true)
    const clamp = (v: any) => (v === '' ? null : Math.max(1, Math.min(5, Number(v))))
    const { error } = await supabase.from('feedback').insert({
      schedule_id: scheduleId,
      nps,
      content_rating: clamp(form.content_rating),
      trainer_rating: clamp(form.trainer_rating),
      venue_rating: clamp(form.venue_rating),
      comments: form.comments.trim() || null,
      created_by: profile?.user_id || null,
    })
    setBusy(false)
    if (error) toast.error(error.message)
    else {
      setForm({ nps: '', content_rating: '', trainer_rating: '', venue_rating: '', comments: '' })
      invalidate(['session_feedback', 'nps_summary', 'trainer_quality'])
      toast.success('Feedback recorded.')
    }
  }

  return (
    <div className="card card-pad">
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div><div className="k-label">Responses</div><div className="k-value">{summary.count}</div></div>
        <div><div className="k-label">NPS</div><div className="k-value">{summary.nps ?? '—'}</div></div>
        <div><div className="k-label">Content</div><div className="k-value">{summary.content}</div></div>
        <div><div className="k-label">Trainer</div><div className="k-value">{summary.trainer}</div></div>
      </div>

      {canManage && (
        <div className="card card-pad" style={{ marginBottom: 16, background: 'var(--surface-2, transparent)' }}>
          <div className="k-label" style={{ marginBottom: 10 }}>Record a response</div>
          <div className="toolbar" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="fill-label">NPS (0–10)
              <input type="number" min={0} max={10} value={form.nps} onChange={(e) => setForm({ ...form, nps: e.target.value })} style={{ width: 70, marginLeft: 6 }} />
            </label>
            {RATINGS.map((r) => (
              <label key={r.key} className="fill-label">{r.label}
                <select value={form[r.key]} onChange={(e) => setForm({ ...form, [r.key]: e.target.value })} style={{ marginLeft: 6 }}>
                  <option value="">—</option>
                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
            ))}
          </div>
          <textarea placeholder="Comments (optional)" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} rows={2} style={{ width: '100%', marginTop: 10 }} />
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-sm" disabled={busy} onClick={submit}>Save response</button>
          </div>
        </div>
      )}

      {list.isLoading ? <Spinner /> : rows.length === 0 ? (
        <div className="empty">No responses recorded for this session.</div>
      ) : (
        <table>
          <thead><tr><th className="right">NPS</th><th className="right">Content</th><th className="right">Trainer</th><th className="right">Venue</th><th>Comments</th><th>Recorded</th></tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.feedback_id}>
                <td className="right">{r.nps ?? '—'}</td>
                <td className="right">{r.content_rating ?? '—'}</td>
                <td className="right">{r.trainer_rating ?? '—'}</td>
                <td className="right">{r.venue_rating ?? '—'}</td>
                <td className="fill-label">{r.comments || '—'}</td>
                <td className="fill-label">{shortDate(r.submitted_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
