'use client'
import { useState, useEffect } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useCourses, useCourseFees, useClients, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { useToast } from '../components/Toast'
import { php } from '../lib/format'
import { lt, formatSegments, LEARNING_TYPES } from '../lib/labels'

const SALES_CHANNELS = ['Inside Sales', 'Field Sales']
const ADMIN_CHANNELS = ['Inside Sales', 'Field Sales', 'In-house Request', 'Webshop']
const blankLine = () => ({ course_id: '', schedule_id: '', modality: 'Live Online Training', seats: 1, amount: '' as string | number, sessions: [] as any[] })

export default function SalesEntry() {
  const { profile } = useAuth()
  const toast = useToast()
  const sp = useSearchParams()
  const router = useRouter()
  const courses = useCourses()
  const fees = useCourseFees()
  const clients = useClients()
  const invalidate = useInvalidate()

  const channels = profile?.role === 'super_admin' ? ADMIN_CHANNELS : SALES_CHANNELS
  const [client, setClient] = useState({ mode: 'new', client_id: '', name: '', company: '', email: '', phone: '' })
  const [head, setHead] = useState({ channel: 'Inside Sales', order_date: new Date().toISOString().slice(0, 10), order_id: '' })
  const [lines, setLines] = useState<any[]>([blankLine()])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)

  // preselected session from the calendar Book link
  useEffect(() => {
    const sid = sp.get('schedule')
    if (!sid) return
    supabase.from('schedule').select('schedule_id, course_id, modality, price').eq('schedule_id', sid).single()
      .then(({ data }) => {
        if (!data) return
        setLines([{ course_id: data.course_id, schedule_id: data.schedule_id, modality: data.modality, seats: 1, amount: data.price ?? '', sessions: [] }])
      })
  }, [sp])

  // load sessions whenever a line's course changes
  const loadSessions = async (idx: number, courseId: string) => {
    if (!courseId) return
    const { data } = await supabase
      .from('schedule')
      .select('schedule_id, start_date, end_date, date_segments, modality, price, min_participants, booked_participants, max_participants')
      .eq('course_id', courseId)
      .in('status', ['Tentative', 'Confirmed'])
      .order('start_date')
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, sessions: data || [] } : l)))
  }

  const feeFor = (courseId: string, modality: string) =>
    fees.data?.find((f: any) => f.course_id === courseId && f.modality === modality)?.fee_php ?? null

  const setLine = (idx: number, patch: any) => {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  const onCourse = (idx: number, courseId: string) => {
    const l = lines[idx]
    const fee = feeFor(courseId, l.modality)
    setLine(idx, { course_id: courseId, schedule_id: '', amount: fee ?? '' })
    loadSessions(idx, courseId)
  }

  const onModality = (idx: number, modality: string) => {
    const l = lines[idx]
    const fee = feeFor(l.course_id, modality)
    setLine(idx, { modality, schedule_id: '', amount: fee ?? '' })
    loadSessions(idx, l.course_id)
  }

  const total = lines.reduce((n, l) => n + (Number(l.amount) || 0) * (Number(l.seats) || 0), 0)
  const totalSeats = lines.reduce((n, l) => n + (Number(l.seats) || 0), 0)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (!head.order_id.trim()) throw new Error('Enter the webshop or reference order number.')
      const good = lines.filter((l) => l.course_id)
      if (good.length === 0) throw new Error('Add at least one training line.')
      for (const l of good) {
        if (l.modality !== 'E-learning' && !l.schedule_id) throw new Error('Pick a session for every scheduled line.')
        if (!l.amount && l.amount !== 0) throw new Error('Set a fee on every line.')
      }

      // client
      let clientId = client.client_id
      if (client.mode === 'new') {
        if (!client.email.trim()) throw new Error('Client email is required.')
        const { data: existing } = await supabase.from('client').select('client_id').eq('email', client.email.trim().toLowerCase()).maybeSingle()
        if (existing) clientId = existing.client_id
        else {
          const { data, error } = await supabase.from('client')
            .insert({
              name: client.name.trim() || client.email.trim(),
              company: client.company.trim() || null,
              email: client.email.trim().toLowerCase(),
              phone: client.phone.trim() || null,
              owner_sales_id: profile?.sales_id || null,
            }).select('client_id').single()
          if (error) throw error
          clientId = data.client_id
        }
      }
      if (!clientId) throw new Error('Select or create a client.')

      // header
      const { error: oErr } = await supabase.from('orders').insert({
        order_id: head.order_id.trim(),
        order_date: head.order_date,
        channel: head.channel,
        modality: good[0].modality,
        seats: 1,
        amount_php: 0,
        client_id: clientId,
        created_by: profile?.user_id,
        fulfillment_stage: 'New',
      })
      if (oErr) throw oErr

      // lines
      const payload = good.map((l, i) => ({
        order_id: head.order_id.trim(),
        line_no: i + 1,
        course_id: l.course_id,
        schedule_id: l.modality === 'E-learning' ? null : l.schedule_id,
        modality: l.modality,
        seats: Number(l.seats),
        amount_php: Number(l.amount) * Number(l.seats),
        access_status: l.modality === 'E-learning' ? 'Pending' : null,
      }))
      const { error: lErr } = await supabase.from('order_line').insert(payload)
      if (lErr) {
        await supabase.from('orders').delete().eq('order_id', head.order_id.trim())
        throw lErr
      }

      // self-assign (non-fatal: the order is already valid without it)
      let assignWarning: string | null = null
      if (profile?.sales_id) {
        const { error: aErr } = await supabase.from('order_assignment')
          .upsert({ order_id: head.order_id.trim(), sales_id: profile.sales_id }, { onConflict: 'order_id' })
        if (aErr) assignWarning = 'Order saved, but it could not be auto-assigned to you. Assign it from the fulfillment screen.'
      }

      invalidate(['orders', 'schedules', 'channel_pax', 'fulfillment_queue', 'clients'])
      const goodSeats = good.reduce((n, l) => n + (Number(l.seats) || 0), 0)
      const goodTotal = payload.reduce((n, p) => n + (Number(p.amount_php) || 0), 0)
      setResult({ order_id: head.order_id.trim(), lines: payload.length, seats: goodSeats, total: goodTotal, warning: assignWarning })
      toast.success('Order created.')
    } catch (err: any) {
      setMsg(err.message)
      toast.error(err.message)
    }
    setBusy(false)
  }

  if (courses.isLoading) return <Spinner label="Loading" />
  if (courses.error) return <ErrorNote error={courses.error} />

  if (result) {
    return (
      <>
        <div className="page-head"><div><h1>Order created</h1></div></div>
        <div className="card card-pad" style={{ maxWidth: 560 }}>
          <div className="notice notice-info">
            Order {result.order_id} saved with {result.lines} line{result.lines > 1 ? 's' : ''},
            {' '}{result.seats} seat{result.seats > 1 ? 's' : ''}, {php(result.total)}. It is assigned to you and sits at stage New.
          </div>
          {result.warning && <div className="notice notice-error">{result.warning}</div>}
          <div className="toolbar">
            <button className="btn" onClick={() => { setResult(null); setLines([blankLine()]); setHead({ ...head, order_id: '' }); setClient({ mode: 'new', client_id: '', name: '', company: '', email: '', phone: '' }) }}>
              New order
            </button>
            <button className="btn btn-ghost" onClick={() => router.push('/worklist')}>Open fulfillment</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New sales order</h1>
          <p>One customer, one order, as many trainings as they bought. Each line books its own session.</p>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="k-label" style={{ marginBottom: 10 }}>Customer</div>
          <div className="toolbar" style={{ marginBottom: 10 }}>
            {['new', 'existing'].map((m) => (
              <button key={m} type="button" className={`btn btn-sm ${client.mode === m ? '' : 'btn-ghost'}`}
                onClick={() => setClient({ ...client, mode: m })}>
                {m === 'new' ? 'New customer' : 'Existing customer'}
              </button>
            ))}
          </div>
          {client.mode === 'existing' ? (
            <select value={client.client_id} onChange={(e) => setClient({ ...client, client_id: e.target.value })}>
              <option value="">Select a client…</option>
              {clients.data?.map((c: any) => (
                <option key={c.client_id} value={c.client_id}>{c.company || c.name} — {c.email}</option>
              ))}
            </select>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <input placeholder="Contact name" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
              <input placeholder="Company (blank for individuals)" value={client.company} onChange={(e) => setClient({ ...client, company: e.target.value })} />
              <input placeholder="Email" type="email" value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
              <input placeholder="Phone" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} />
            </div>
          )}
        </div>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="k-label" style={{ marginBottom: 10 }}>Order</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label className="field"><span>Order number</span>
              <input value={head.order_id} onChange={(e) => setHead({ ...head, order_id: e.target.value })} placeholder="60806000000xxx" required />
            </label>
            <label className="field"><span>Order date</span>
              <input type="date" value={head.order_date} onChange={(e) => setHead({ ...head, order_date: e.target.value })} required />
            </label>
            <label className="field"><span>Channel</span>
              <select value={head.channel} onChange={(e) => setHead({ ...head, channel: e.target.value })}>
                {channels.map((c) => (<option key={c}>{c}</option>))}
              </select>
            </label>
          </div>
        </div>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
            <div className="k-label">Training lines</div>
            <div className="fill-label">{totalSeats} seat{totalSeats === 1 ? '' : 's'} · {php(total)}</div>
          </div>

          {lines.map((l, i) => {
            const cat = feeFor(l.course_id, l.modality)
            return (
              <div key={i} className="drawer-section" style={{ marginTop: i === 0 ? 0 : 14, paddingTop: i === 0 ? 0 : 14, borderTop: i === 0 ? 'none' : undefined }}>
                <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
                  <div className="fill-label">Line {i + 1}</div>
                  {lines.length > 1 && (
                    <button type="button" className="linkbtn" onClick={() => setLines(lines.filter((_, x) => x !== i))}>Remove</button>
                  )}
                </div>
                <select value={l.course_id} onChange={(e) => onCourse(i, e.target.value)} style={{ marginBottom: 8 }}>
                  <option value="">Select a course…</option>
                  {courses.data.map((c: any) => (
                    <option key={c.course_id} value={c.course_id}>{c.course_name} ({c.training_type})</option>
                  ))}
                </select>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <label className="field"><span>Learning type</span>
                    <select value={l.modality} onChange={(e) => onModality(i, e.target.value)}>
                      {LEARNING_TYPES.map((m) => (<option key={m} value={m}>{lt(m)}</option>))}
                    </select>
                  </label>
                  <label className="field"><span>Session</span>
                    {l.modality === 'E-learning' ? (
                      <input value="No session — access granted after payment" disabled />
                    ) : (
                      <select value={l.schedule_id} onChange={(e) => {
                        const s = l.sessions.find((x: any) => x.schedule_id === e.target.value)
                        setLine(i, {
                          schedule_id: e.target.value,
                          modality: s ? s.modality : l.modality,
                          amount: s && (l.amount === '' || Number(l.amount) === 0) ? (s.price ?? l.amount) : l.amount,
                        })
                      }}>
                        <option value="">Select a date…</option>
                        {l.sessions.map((s: any) => {
                          const left = s.max_participants == null ? null : s.max_participants - s.booked_participants
                          const full = left != null && left < Number(l.seats || 1)
                          return (
                            <option key={s.schedule_id} value={s.schedule_id} disabled={full}>
                              {formatSegments(s.date_segments, s.start_date, s.end_date)} · {lt(s.modality)} · {s.booked_participants}/{s.min_participants} booked
                              {left != null ? ` · ${left} left` : ''}{full ? ' — full' : ''}
                            </option>
                          )
                        })}
                      </select>
                    )}
                  </label>
                  <label className="field"><span>Seats</span>
                    <input type="number" min="1" value={l.seats} onChange={(e) => setLine(i, { seats: e.target.value })} />
                  </label>
                  <label className="field"><span>Fee per seat {cat != null && `(catalog ${php(cat)})`}</span>
                    <input type="number" min="0" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
                  </label>
                </div>
                {l.course_id && l.modality !== 'E-learning' && l.sessions.length === 0 && (
                  <div className="notice notice-info">
                    This course has no open session yet. Ask operations to schedule one, or sell it as E-learning if it is self-paced.
                  </div>
                )}
              </div>
            )
          })}

          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setLines([...lines, blankLine()])}>
            + Add another training
          </button>
        </div>

        {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}
        <div className="toolbar">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : `Create order · ${php(total)}`}</button>
        </div>
      </form>
    </>
  )
}
