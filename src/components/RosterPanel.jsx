import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useRoster, useSessionOrders, useInvalidate } from '../hooks/data'
import { Spinner } from './ui'

const ATT = ['Registered', 'Attended', 'No Show']

export default function RosterPanel({ schedule }) {
  const { profile } = useAuth()
  const roster = useRoster(schedule.schedule_id)
  const orders = useSessionOrders(schedule.schedule_id)
  const invalidate = useInvalidate()
  const [form, setForm] = useState({ line_id: '', full_name: '', email: '', position_title: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  const canEdit = ['operations', 'super_admin', 'sales'].includes(profile?.role)
  const live = (orders.data || []).filter((l) => l.line_status !== 'Cancelled')
  const seatsSold = live.reduce((n, l) => n + l.seats, 0)
  const names = roster.data?.length || 0

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
    if (error) setMsg(error.message)
    else {
      setForm({ line_id: form.line_id, full_name: '', email: '', position_title: '' })
      invalidate(['roster'])
    }
    setBusy(false)
  }

  const mark = async (pid, status) => {
    await supabase.from('participant').update({ attendance_status: status }).eq('participant_id', pid)
    invalidate(['roster'])
  }

  const remove = async (pid) => {
    await supabase.from('participant').delete().eq('participant_id', pid)
    invalidate(['roster'])
  }

  const exportCsv = () => {
    const head = ['Name', 'Email', 'Position', 'Company', 'Order', 'Payment', 'Attendance']
    const lines = (roster.data || []).map((r) =>
      [r.full_name, r.email || '', r.position_title || '', r.company || '', r.order_id, r.payment_status, r.attendance_status]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')
    )
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `roster-${schedule.course?.course_name?.slice(0, 30) || 'session'}-${schedule.start_date}.csv`
    a.click()
  }

  if (roster.isLoading) return <Spinner label="Loading roster" />

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 12, justifyContent: 'space-between' }}>
        <div className="fill-label">
          {names} of {seatsSold} name{seatsSold === 1 ? '' : 's'} captured
          {names < seatsSold && <span style={{ color: 'var(--tr-amber)', fontWeight: 600 }}> · {seatsSold - names} missing</span>}
        </div>
        {names > 0 && <button className="btn btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>}
      </div>

      {roster.data?.length > 0 && (
        <table style={{ marginBottom: 14 }}>
          <thead><tr><th>Name</th><th>Company</th><th>Attendance</th><th></th></tr></thead>
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
          {msg && <div className="notice notice-error" style={{ margin: '10px 0' }}>{msg}</div>}
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={add} disabled={busy}>
            {busy ? 'Adding…' : 'Add to roster'}
          </button>
        </div>
      )}

      {live.length === 0 && <div className="empty">No bookings on this session yet.</div>}
    </div>
  )
}
