'use client'

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useRoster, useSessionOrders, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote } from './ui'
import { useToast } from './Toast'

// Neutralize spreadsheet formula injection: a cell starting with = + - @ (or
// tab/CR) is prefixed with a single quote so Excel/Sheets treat it as text.
const csvCell = (v) => {
  const s = v == null ? '' : String(v)
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return `"${safe.replace(/"/g, '""')}"`
}

const ATT = ['Registered', 'Attended', 'No Show']

export default function RosterPanel({ schedule }: { schedule: any }) {
  const { profile } = useAuth()
  const toast = useToast()
  const roster = useRoster(schedule.schedule_id)
  const orders = useSessionOrders(schedule.schedule_id)
  const invalidate = useInvalidate()
  const [form, setForm] = useState({ line_id: '', full_name: '', email: '', position_title: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const canEdit = ['operations', 'super_admin', 'sales'].includes(profile?.role)
  const canCert = ['operations', 'super_admin'].includes(profile?.role)
  const live = (orders.data || []).filter((l) => !['Cancelled', 'Waitlist'].includes(l.line_status))
  const seatsSold = live.reduce((n, l) => n + (Number(l.seats) || 0), 0)
  const names = roster.data?.length || 0
  const pending = (roster.data || []).filter((r) => r.attendance_status === 'Attended' && !r.cert_number).length

  const add = async () => {
    if (!form.line_id || !form.full_name.trim()) { setMsg('Pick the booking and enter a name.'); return }
    setBusy(true); setMsg(null)
    const line = live.find((l) => l.line_id === form.line_id)
    const { error } = await supabase.from('participant').insert({
      order_id: line?.order?.order_id,
      line_id: form.line_id,
      schedule_id: schedule.schedule_id,
      full_name: form.full_name.trim(),
      email: form.email.trim() || null,
      position_title: form.position_title.trim() || null,
      created_by: profile.user_id,
    })
    if (error) { setMsg(error.message); toast.error(error.message) }
    else {
      setForm({ line_id: form.line_id, full_name: '', email: '', position_title: '' })
      invalidate(['roster'])
      toast.success('Participant added.')
    }
    setBusy(false)
  }

  const mark = async (pid, status) => {
    setMsg(null)
    const { error } = await supabase.from('participant').update({ attendance_status: status }).eq('participant_id', pid)
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { invalidate(['roster']); toast.success('Attendance updated.') }
  }

  const remove = async (pid) => {
    setMsg(null)
    const { error } = await supabase.from('participant').delete().eq('participant_id', pid)
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { invalidate(['roster']); toast.success('Participant removed.') }
  }

  const issueOne = async (pid) => {
    setMsg(null)
    const { error } = await supabase.rpc('fn_issue_certificate', { p_participant: pid })
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { invalidate(['roster']); toast.success('Certificate issued.') }
  }

  const issueAll = async () => {
    setMsg(null); setBusy(true)
    const { data, error } = await supabase.rpc('fn_issue_certificates_for_session', { p_schedule: schedule.schedule_id })
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { invalidate(['roster']); toast.success(`${data || 0} certificate${data === 1 ? '' : 's'} issued.`) }
    setBusy(false)
  }

  const exportCsv = () => {
    const head = ['Name', 'Email', 'Position', 'Company', 'Order', 'Payment', 'Attendance', 'Certificate', 'Issued']
    const lines = (roster.data || []).map((r) =>
      [r.full_name, r.email, r.position_title, r.company, r.order_id, r.payment_status, r.attendance_status, r.cert_number, r.cert_issued_date]
        .map(csvCell).join(',')
    )
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `roster-${schedule.course?.course_name?.slice(0, 30) || 'session'}-${schedule.start_date}.csv`
    a.click()
  }

  if (roster.isLoading) return <Spinner label="Loading roster" />
  if (roster.error) return <ErrorNote error={roster.error} />

  return (
    <div>
      {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="toolbar" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <div className="fill-label">
          {names} of {seatsSold} name{seatsSold === 1 ? '' : 's'} captured
          {names < seatsSold && <span style={{ color: 'var(--tr-amber)', fontWeight: 600 }}> · {seatsSold - names} missing</span>}
        </div>
        <div className="toolbar" style={{ gap: 6 }}>
          {canCert && pending > 0 && (
            <button className="btn btn-sm" onClick={issueAll} disabled={busy}>
              {busy ? 'Issuing…' : `Issue ${pending} certificate${pending === 1 ? '' : 's'}`}
            </button>
          )}
          {names > 0 && <button className="btn btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>}
        </div>
      </div>

      {roster.data?.length > 0 && (
        <table style={{ marginBottom: 14 }}>
          <thead><tr><th>Name</th><th>Company</th><th>Attendance</th><th>Certificate</th><th></th></tr></thead>
          <tbody>
            {roster.data.map((r) => (
              <tr key={r.participant_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.full_name}</div>
                  <div className="fill-label">{r.position_title || r.email || '—'}</div>
                </td>
                <td className="fill-label">{r.company || '—'}</td>
                <td>
                  {canEdit ? (
                    <select value={r.attendance_status} onChange={(e) => mark(r.participant_id, e.target.value)}>
                      {ATT.map((a) => (<option key={a}>{a}</option>))}
                    </select>
                  ) : r.attendance_status}
                </td>
                <td>
                  {r.cert_number ? (
                    <div>
                      <div style={{ fontWeight: 600, fontFamily: 'var(--font-mono, monospace)' }}>{r.cert_number}</div>
                      {r.cert_issued_date && <div className="fill-label">{r.cert_issued_date}</div>}
                    </div>
                  ) : canCert && r.attendance_status === 'Attended' ? (
                    <button className="btn btn-ghost btn-sm" onClick={() => issueOne(r.participant_id)}>Issue</button>
                  ) : (
                    <span className="fill-label">—</span>
                  )}
                </td>
                <td className="right">
                  {canEdit && <button className="linkbtn" onClick={() => remove(r.participant_id)}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && live.length > 0 && (
        <div className="drawer-section" style={{ marginTop: 4 }}>
          <div className="k-label" style={{ marginBottom: 8 }}>Add participant</div>
          <select value={form.line_id} onChange={(e) => setForm({ ...form, line_id: e.target.value })} style={{ marginBottom: 8 }}>
            <option value="">Against which booking…</option>
            {live.map((l) => (
              <option key={l.line_id} value={l.line_id}>
                {l.order?.client?.company || l.order?.client?.name || l.order?.order_id} · {l.seats} seat{l.seats > 1 ? 's' : ''}
              </option>
            ))}
          </select>
          <input placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} style={{ marginBottom: 8 }} />
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input placeholder="Position" value={form.position_title} onChange={(e) => setForm({ ...form, position_title: e.target.value })} />
          </div>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={add} disabled={busy}>
            {busy ? 'Adding…' : 'Add to roster'}
          </button>
        </div>
      )}

      {live.length === 0 && <div className="empty">No bookings on this session yet.</div>}
    </div>
  )
}
