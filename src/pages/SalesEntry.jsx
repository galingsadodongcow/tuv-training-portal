import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useOpenSchedules } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { dateRange, php } from '../lib/format'
import { lt } from '../lib/labels'

export default function SalesEntry() {
  const { session } = useAuth()
  const schedules = useOpenSchedules(2026)
  const qc = useQueryClient()

  const [sp] = useSearchParams()
  const [form, setForm] = useState({
    channel: 'Inside Sales',
    schedule_id: sp.get('schedule') || '',
    company: '',
    contact_name: '',
    email: '',
    phone: '',
    seats: 1,
    amount_php: '',
  })
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setResult(null)
    try {
      const sched = schedules.data.find((s) => s.schedule_id === form.schedule_id)
      if (!sched) throw new Error('Pick a session first.')

      // 1. client (owned by this salesperson)
      const { data: sp } = await supabase
        .from('profiles')
        .select('sales_id')
        .eq('user_id', session.user.id)
        .single()

      const { data: client, error: cErr } = await supabase
        .from('client')
        .insert({
          name: form.contact_name,
          company: form.company,
          contact: form.email || form.phone,
          email: form.email || null,
          phone: form.phone || null,
          owner_sales_id: sp.sales_id,
        })
        .select('client_id')
        .single()
      if (cErr) throw cErr

      // 2. order (portal-generated id, channel Inside/Field Sales)
      const orderId = `PS-${Date.now()}`
      const { error: oErr } = await supabase.from('orders').insert({
        order_id: orderId,
        order_date: new Date().toISOString().slice(0, 10),
        channel: form.channel,
        created_by: session.user.id,
        schedule_id: sched.schedule_id,
        client_id: client.client_id,
        modality: sched.modality,
        seats: Number(form.seats),
        amount_php: Number(form.amount_php || sched.price || 0),
        payment_status: 'Unpaid',
        order_status: 'New',
      })
      if (oErr) throw oErr

      // 3. self-assign
      await supabase.from('order_assignment').insert({ order_id: orderId, sales_id: sp.sales_id })

      // 4. run duplicate detection
      await supabase.rpc('fn_detect_duplicates')

      setResult({ ok: true, id: orderId })
      setForm((f) => ({ ...f, company: '', contact_name: '', email: '', phone: '', seats: 1, amount_php: '' }))
      qc.invalidateQueries({ queryKey: ['orders'] })
      qc.invalidateQueries({ queryKey: ['channel_pax'] })
      qc.invalidateQueries({ queryKey: ['duplicates'] })
    } catch (err) {
      setResult({ ok: false, message: err.message })
    }
    setBusy(false)
  }

  if (schedules.isLoading) return <Spinner label="Loading sessions" />
  if (schedules.error) return <ErrorNote error={schedules.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New sales order</h1>
          <p>Records an inside or field sale against a calendar session. Creates the order and the client under your name.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 620 }}>
        <form onSubmit={submit}>
          <label className="field">
            <span>Channel</span>
            <select value={form.channel} onChange={set('channel')}>
              <option>Inside Sales</option>
              <option>Field Sales</option>
            </select>
          </label>

          <label className="field">
            <span>Session</span>
            <select value={form.schedule_id} onChange={set('schedule_id')} required>
              <option value="">Select a session…</option>
              {schedules.data.map((s) => (
                <option key={s.schedule_id} value={s.schedule_id}>
                  {s.course?.course_name} · {dateRange(s.start_date, s.end_date)} · {lt(s.modality)} · {php(s.price)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field">
              <span>Company</span>
              <input value={form.company} onChange={set('company')} required />
            </label>
            <label className="field">
              <span>Contact name</span>
              <input value={form.contact_name} onChange={set('contact_name')} required />
            </label>
            <label className="field">
              <span>Email</span>
              <input type="email" value={form.email} onChange={set('email')} />
            </label>
            <label className="field">
              <span>Phone</span>
              <input value={form.phone} onChange={set('phone')} />
            </label>
            <label className="field">
              <span>Seats</span>
              <input type="number" min="1" value={form.seats} onChange={set('seats')} required />
            </label>
            <label className="field">
              <span>Amount (PHP, blank uses session fee)</span>
              <input type="number" min="0" value={form.amount_php} onChange={set('amount_php')} />
            </label>
          </div>

          {result?.ok && (
            <div className="notice notice-info" style={{ marginBottom: 12 }}>
              Order {result.id} created and assigned to you. It now shows on the calendar under {form.channel}.
            </div>
          )}
          {result && !result.ok && (
            <div className="notice notice-error" style={{ marginBottom: 12 }}>{result.message}</div>
          )}

          <button className="btn" disabled={busy}>
            {busy ? 'Saving…' : 'Create order'}
          </button>
        </form>
      </div>
    </>
  )
}
