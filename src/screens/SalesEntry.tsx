'use client'
import { useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useCourses, useCourseFees, useClients, useInvalidate, usePossibleDuplicateClients, useQuoteLines } from '../hooks/data'
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
  // Whether a submit has been attempted — gates inline per-field validation so
  // the form doesn't nag before the rep has had a chance to fill it in.
  const [tried, setTried] = useState(false)

  // At-source duplicate check: existing clients that already carry this email
  // (RLS-scoped). Only meaningful for a new customer; passing '' when picking an
  // existing client self-disables the hook. Called unconditionally at top level.
  const dupClients = usePossibleDuplicateClients(client.mode === 'new' ? client.email : '')

  // When converting a quote (?quote=<id>), prefill the line editor from the
  // quote's lines so conversion is a review step, not re-entry. Fetched
  // unconditionally at top level; the hook self-disables when there is no quote.
  const quoteId = sp.get('quote') || undefined
  const quoteLines = useQuoteLines(quoteId)
  const prefilledRef = useRef(false)
  const [quotePrefilled, setQuotePrefilled] = useState(false)

  // Map the quote's lines onto SalesEntry line objects once, guarded so a
  // re-render or the rep's edits can't wipe what they've changed. Session is
  // left empty — quote lines are course-level, so the rep picks the session.
  useEffect(() => {
    if (!quoteId || prefilledRef.current) return
    const rows = quoteLines.data
    if (!rows || rows.length === 0) return
    prefilledRef.current = true
    setLines(rows.map((r: any) => ({
      course_id: r.course_id || '',
      schedule_id: '',
      modality: r.modality || blankLine().modality,
      seats: r.seats ?? 1,
      amount: r.unit_price ?? '',
      sessions: [] as any[],
    })))
    setQuotePrefilled(true)
  }, [quoteId, quoteLines.data])

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

  // preselected existing client, e.g. when starting an order from a quote
  useEffect(() => {
    const cid = sp.get('client')
    if (cid) setClient((c) => ({ ...c, mode: 'existing', client_id: cid }))
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

  // Seats left on a line's chosen session, or null when there is no cap.
  const seatsLeftFor = (l: any) => {
    const s = l.sessions?.find((x: any) => x.schedule_id === l.schedule_id)
    if (!s || s.max_participants == null) return null
    return s.max_participants - s.booked_participants
  }
  const isWaitlisted = (l: any) => {
    if (l.modality === 'E-learning' || !l.schedule_id) return false
    const left = seatsLeftFor(l)
    return left != null && left < Number(l.seats || 1)
  }

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

  // ---- Capture-time validation (surface only; the submit path below is the
  // authoritative gate and is left untouched). Errors show once submit is tried.
  const orderIdError = tried && !head.order_id.trim() ? 'Order number is required.' : null
  const emailError = tried && client.mode === 'new' && !client.email.trim() ? 'Client email is required.' : null
  const noLineError = tried && lines.filter((l) => l.course_id).length === 0 ? 'Add at least one training line.' : null
  const lineFeeError = (l: any) => tried && l.course_id && !l.amount && l.amount !== 0 ? 'Set a fee for this line.' : null
  const lineSessionError = (l: any) =>
    tried && l.course_id && l.modality !== 'E-learning' && !l.schedule_id ? 'Pick a session for this line.' : null
  // Non-blocking format sanity check on the reference/SAP order number. Catches
  // obvious typos (spaces, wrong length, illegal chars) without imposing a
  // specific corporate format — a warning only, it never blocks the save.
  const orderIdRef = head.order_id.trim()
  const orderIdWarn = orderIdRef && !/^[A-Za-z0-9-]{3,30}$/.test(orderIdRef)
    ? 'Check this reference — expected 3–30 letters, digits or dashes (no spaces).'
    : null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTried(true)
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
          // A unique-constraint hit (23505) means the email already exists — often
          // on a client owned by another rep and hidden from this one by RLS, so
          // the earlier dedup lookup returned nothing. Surface a friendly message.
          if (error?.code === '23505') throw new Error('A customer with this email already exists or is owned by another rep.')
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
        line_status: isWaitlisted(l) ? 'Waitlist' : 'New',
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
      const waitlisted = payload.filter((p) => p.line_status === 'Waitlist').length
      // If this order started from a quote, mark that quote accepted and linked.
      const quoteId = sp.get('quote')
      if (quoteId) await supabase.from('quote').update({ converted_order_id: head.order_id.trim(), status: 'Accepted' }).eq('quote_id', quoteId)
      setResult({ order_id: head.order_id.trim(), lines: payload.length, seats: goodSeats, total: goodTotal, warning: assignWarning, waitlisted })
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
          {result.waitlisted > 0 && (
            <div className="notice notice-warn">
              {result.waitlisted} line{result.waitlisted > 1 ? 's' : ''} went to the waitlist because the session was full.
              Operations will promote {result.waitlisted > 1 ? 'them' : 'it'} to a seat when one opens.
            </div>
          )}
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
            <select aria-label="Existing client" value={client.client_id} onChange={(e) => setClient({ ...client, client_id: e.target.value })}>
              <option value="">Select a client…</option>
              {clients.data?.map((c: any) => (
                <option key={c.client_id} value={c.client_id}>{c.company || c.name} — {c.email}</option>
              ))}
            </select>
          ) : (
            <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <input aria-label="Contact name" placeholder="Contact name" value={client.name} onChange={(e) => setClient({ ...client, name: e.target.value })} />
              <input aria-label="Company" placeholder="Company (blank for individuals)" value={client.company} onChange={(e) => setClient({ ...client, company: e.target.value })} />
              <div>
                <input aria-label="Email" placeholder="Email" type="email" className={emailError ? 'invalid' : undefined} value={client.email} onChange={(e) => setClient({ ...client, email: e.target.value })} />
                {emailError && <span className="field-error">{emailError}</span>}
              </div>
              <input aria-label="Phone" placeholder="Phone" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} />
            </div>
          )}
          {client.mode === 'new' && dupClients.data && dupClients.data.length > 0 && (
            <div className="notice notice-warn" style={{ marginTop: 10 }}>
              A client with this email already exists — this may be a duplicate. Continue only if this is a separate order.
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {dupClients.data.map((c: any) => (
                  <li key={c.client_id}>
                    {c.client_id
                      ? <Link href={`/clients/${c.client_id}`}>{c.name || c.email}</Link>
                      : (c.name || c.email)}
                    {c.company ? ` (${c.company})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="k-label" style={{ marginBottom: 10 }}>Order</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <label className="field"><span>Order number<span className="req-star">*</span></span>
              <input value={head.order_id} onChange={(e) => setHead({ ...head, order_id: e.target.value })} placeholder="60806000000xxx" required className={orderIdError ? 'invalid' : undefined} />
              {orderIdError && <span className="field-error">{orderIdError}</span>}
              {!orderIdError && orderIdWarn && <span className="field-error" style={{ color: 'var(--warning)' }}>{orderIdWarn}</span>}
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

          {quotePrefilled && quoteId && (
            <div className="notice notice-info" style={{ marginBottom: 12 }}>
              Lines prefilled from quote {quoteId} — review and pick sessions before saving.
            </div>
          )}

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
                <select aria-label="Course" value={l.course_id} onChange={(e) => onCourse(i, e.target.value)} style={{ marginBottom: 8 }}>
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
                  <label className="field"><span>Session{l.modality !== 'E-learning' && <span className="req-star">*</span>}</span>
                    {l.modality === 'E-learning' ? (
                      <input value="No session — access granted after payment" disabled />
                    ) : (
                      <select className={lineSessionError(l) ? 'invalid' : undefined} value={l.schedule_id} onChange={(e) => {
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
                            <option key={s.schedule_id} value={s.schedule_id}>
                              {formatSegments(s.date_segments, s.start_date, s.end_date)} · {lt(s.modality)} · {s.booked_participants}/{s.min_participants} booked
                              {left != null ? ` · ${left} left` : ''}{full ? ' — full, joins waitlist' : ''}
                            </option>
                          )
                        })}
                      </select>
                    )}
                    {lineSessionError(l) && <span className="field-error">{lineSessionError(l)}</span>}
                  </label>
                  <label className="field"><span>Seats</span>
                    <input type="number" min="1" value={l.seats} onChange={(e) => setLine(i, { seats: e.target.value })} />
                  </label>
                  <label className="field"><span>Fee per seat<span className="req-star">*</span> {cat != null && `(catalog ${php(cat)})`}</span>
                    <input type="number" min="0" className={lineFeeError(l) ? 'invalid' : undefined} value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
                    {lineFeeError(l) && <span className="field-error">{lineFeeError(l)}</span>}
                  </label>
                </div>
                {l.course_id && l.modality !== 'E-learning' && l.sessions.length === 0 && (
                  <div className="notice notice-info">
                    This course has no open session yet. Ask operations to schedule one, or sell it as E-learning if it is self-paced.
                  </div>
                )}
                {isWaitlisted(l) && (
                  <div className="notice notice-warn" style={{ marginTop: 8 }}>
                    This session is full. This line will be saved to the waitlist and promoted when a seat opens.
                  </div>
                )}
              </div>
            )
          })}

          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setLines([...lines, blankLine()])}>
            + Add another training
          </button>
          {noLineError && <span className="field-error">{noLineError}</span>}
        </div>

        {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}
        <div className="toolbar">
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : `Create order · ${php(total)}`}</button>
        </div>
      </form>
    </>
  )
}
