'use client'
import { useMemo, useState, useEffect } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useInquiries, useCourses, useSalespeople, useClients, useInvalidate } from '../hooks/data'
import { useSort } from '../hooks/useSort'
import { Combobox } from '../components/inputs/Combobox'
import { ClientTypeahead } from '../components/inputs/ClientTypeahead'
import { useFormErrors, Field } from '../components/inputs/Field'
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

const emptyForm = { company: '', contact: '', email: '', phone: '', course_id: '', client_id: '', pax: '', offering_type: 'Public', sales_id: '', est_value: '', probability: '', expected_close: '', source: '' }

// The inquiry pipeline. Rendered as the "Pipeline" tab of the CRM shell
// (`embedded`), where the shell owns the heading + tab strip.
export default function Inquiries({ embedded }: { embedded?: boolean } = {}) {
  const { profile } = useAuth()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const inquiries = useInquiries()
  const courses = useCourses()
  const people = useSalespeople()
  const clients = useClients()
  const invalidate = useInvalidate()
  const toast = useToast()
  const confirm = useConfirm()
  const isAdmin = profile?.role === 'super_admin'
  // Inquiry writes per the role matrix: super_admin, coordinator, sales, sales_manager.
  // operations/business_owner/management/auditor are read-only (RLS rejects their
  // writes) — so the board's action controls are hidden from them, not just refused.
  const canEdit = ['super_admin', 'coordinator', 'sales', 'sales_manager'].includes(profile?.role as string)

  // Table is the default daily view (who to work, what's overdue); the Kanban board
  // is a toggle for pipeline-movement sessions.
  const [view, setView] = useState<'table' | 'board'>('table')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<any>(emptyForm)
  const [busy, setBusy] = useState(false)
  // Inline per-field validation for the New-inquiry form (#125).
  const fe = useFormErrors()
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const createErrors = {
    company: !form.company.trim() ? 'Company is required.' : null,
    email: form.email.trim() && !emailRe.test(form.email.trim()) ? 'Enter a valid email.' : null,
    sales: isAdmin && !form.sales_id ? 'Pick a salesperson.' : null,
  }
  // #120: an existing client whose company or email matches what was typed but
  // isn't linked — surfaced as a soft warning with a one-click link, so the same
  // customer isn't logged twice.
  const dupClient = useMemo(() => {
    if (form.client_id) return null
    const co = form.company.trim().toLowerCase()
    const em = form.email.trim().toLowerCase()
    if (!co && !em) return null
    return ((clients.data || []) as any[]).find((c: any) =>
      (co && (c.company || '').toLowerCase() === co) || (em && em.length > 4 && (c.email || '').toLowerCase() === em)
    ) || null
  }, [form.company, form.email, form.client_id, clients.data])
  // Deal-sizing fields (value, probability, close, source, …) fold away — logging
  // an inbound lead only needs the company and a contact; qualification comes later.
  const [dealDetails, setDealDetails] = useState(false)
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))
  // Edit an existing lead. The "New inquiry" form is deliberately lean (CRM1), so
  // qualification (value, probability, close, source, …) is added here afterwards —
  // otherwise a lean-logged lead could never be qualified and the weighted pipeline
  // would stay blank. RLS governs who may actually update (own/coordinator/admin).
  const [editId, setEditId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>(emptyForm)
  const setE = (k: string) => (e: any) => setEditForm((f: any) => ({ ...f, [k]: e.target.value }))

  // Course options for the searchable course picker (the catalogue is long).
  const courseOptions = useMemo(
    () => (courses.data || []).map((c: any) => ({ value: c.course_id, label: c.course_name })),
    [courses.data]
  )

  const byStage = useMemo(() => {
    const m: Record<string, any[]> = {}
    for (const s of STAGES) m[s] = []
    for (const q of inquiries.data || []) (m[q.status] ||= []).push(q)
    return m
  }, [inquiries.data])

  const createInquiry = async () => {
    if (!fe.submit(createErrors)) return
    const salesId = isAdmin ? form.sales_id : profile?.sales_id
    if (!salesId) { toast.error('Pick a salesperson for this inquiry.'); return }
    setBusy(true)
    const body: any = {
      sales_id: salesId,
      company: form.company.trim(),
      contact: form.contact.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      client_id: form.client_id || null,
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
    else { toast.success('Inquiry added.'); setForm(emptyForm); setCreating(false); setDealDetails(false); invalidate(['inquiries']) }
    setBusy(false)
  }

  const move = async (id: string, status: string) => {
    const { error } = await supabase.from('inquiry').update({ status }).eq('inquiry_id', id)
    if (error) toast.error(error.message)
    else invalidate(['inquiries'])
  }

  const openEdit = (q: any) => {
    setCreating(false)
    setEditForm({
      company: q.company || '', contact: q.contact || '', email: q.email || '', phone: q.phone || '',
      course_id: q.course_id || '', pax: q.pax ?? '', offering_type: q.offering_type || 'Public',
      est_value: q.est_value ?? '', probability: q.probability ?? '', expected_close: q.expected_close || '', source: q.source || '',
    })
    setEditId(q.inquiry_id)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const saveEdit = async () => {
    if (!editForm.company.trim()) { toast.error('Company is required.'); return }
    setBusy(true)
    const body: any = {
      company: editForm.company.trim(),
      contact: editForm.contact.trim() || null,
      email: editForm.email.trim() || null,
      phone: editForm.phone.trim() || null,
      course_id: editForm.course_id || null,
      pax: editForm.pax === '' ? null : Number(editForm.pax),
      offering_type: editForm.offering_type,
      est_value: editForm.est_value === '' ? null : Number(editForm.est_value),
      probability: editForm.probability === '' ? null : Number(editForm.probability),
      expected_close: editForm.expected_close || null,
      source: editForm.source || null,
    }
    const missingColumn = (e: any) => !!e && (e.code === '42703' || /column .* does not exist/i.test(e.message || ''))
    let { error } = await supabase.from('inquiry').update(body).eq('inquiry_id', editId)
    if (error && missingColumn(error)) {
      const { est_value, probability, expected_close, source, ...base } = body
      ;({ error } = await supabase.from('inquiry').update(base).eq('inquiry_id', editId))
    }
    if (error) toast.error(error.message)
    else { toast.success('Inquiry updated.'); setEditId(null); invalidate(['inquiries']) }
    setBusy(false)
  }

  const markLost = async (q: any) => {
    const res = await confirm({ title: 'Mark this lead as lost?', confirmLabel: 'Mark lost', tone: 'danger', reason: 'optional', reasonLabel: 'Reason lost' })
    if (!res.ok) return
    const prior = q.status
    const { error } = await supabase.from('inquiry').update({ status: 'Closed Lost', lost_reason: res.reason || null }).eq('inquiry_id', q.inquiry_id)
    if (error) toast.error(error.message)
    else {
      invalidate(['inquiries'])
      // #137: symmetric undo — restore the prior stage and clear the lost reason.
      toast.success('Lead marked lost.', { label: 'Undo', onClick: async () => {
        await supabase.from('inquiry').update({ status: prior, lost_reason: null }).eq('inquiry_id', q.inquiry_id)
        invalidate(['inquiries'])
      } })
    }
  }

  // Convert a qualified lead into a quote or order, carrying the customer so
  // identity is entered once (threads #120's client link inquiry → quote/order).
  const canConvert = ['super_admin', 'coordinator', 'sales'].includes(profile?.role as string)
  const [converting, setConverting] = useState('')

  const linkInquiryClient = async (inquiryId: string, clientId: string) => {
    await supabase.from('inquiry').update({ client_id: clientId }).eq('inquiry_id', inquiryId)
    invalidate(['inquiries'])
  }
  // Resolve a client for conversion: the linked client, else an exact
  // company/email match reused, else a new client created from the inquiry — then
  // linked back. Used where a client_id is required up front (quotes).
  const resolveClientId = async (inq: any): Promise<string | null> => {
    if (inq.client_id) return inq.client_id
    const co = (inq.company || '').trim().toLowerCase()
    const em = (inq.email || '').trim().toLowerCase()
    const match = ((clients.data || []) as any[]).find((c) =>
      (co && (c.company || '').toLowerCase() === co) || (em && em.length > 4 && (c.email || '').toLowerCase() === em)
    )
    if (match) { await linkInquiryClient(inq.inquiry_id, match.client_id); return match.client_id }
    const { data, error } = await supabase.from('client').insert({
      company: inq.company || null, name: inq.contact || null, email: inq.email || null,
      phone: inq.phone || null, owner_sales_id: inq.sales_id || null,
    }).select('client_id').single()
    if (error) { toast.error(error.message); return null }
    await linkInquiryClient(inq.inquiry_id, data.client_id)
    toast.success('Created a client record for this customer.')
    return data.client_id
  }
  const convertToOrder = async (inq: any) => {
    setConverting(inq.inquiry_id + ':order')
    // Orders can start a new client on save (with their own dedup), so pass the
    // linked client when present, otherwise seed the new-client fields — no
    // premature client record if the rep abandons the order.
    const parts = new URLSearchParams()
    if (inq.client_id) parts.set('client', inq.client_id)
    else {
      if (inq.company) parts.set('company', inq.company)
      if (inq.contact) parts.set('contact', inq.contact)
      if (inq.email) parts.set('email', inq.email)
      if (inq.phone) parts.set('phone', inq.phone)
    }
    if (inq.course_id) parts.set('course', inq.course_id)
    router.push(`/sales-entry?${parts.toString()}`)
  }
  const convertToQuote = async (inq: any) => {
    setConverting(inq.inquiry_id + ':quote')
    const cid = await resolveClientId(inq) // a quote needs a client up front
    if (!cid) { setConverting(''); return }
    const parts = new URLSearchParams({ new: '1', client: cid })
    if (inq.sales_id) parts.set('sales', String(inq.sales_id))
    router.push(`/crm?tab=quotes&${parts.toString()}`)
  }
  const ConvertActions = ({ q, btn }: { q: any; btn?: boolean }) => (canConvert && q.status !== 'Closed Lost') ? (
    <>
      <button className={btn ? 'btn btn-ghost btn-sm' : 'linkbtn'} title="Create a quote for this lead"
        disabled={converting === q.inquiry_id + ':quote'} onClick={() => convertToQuote(q)}>Quote</button>
      <button className={btn ? 'btn btn-ghost btn-sm' : 'linkbtn'} title="Create an order for this lead"
        disabled={converting === q.inquiry_id + ':order'} onClick={() => convertToOrder(q)}>Order</button>
    </>
  ) : null

  const weighted = (inquiries.data || [])
    .filter((q: any) => OPEN_STAGES.includes(q.status))
    .reduce((n: number, q: any) => n + (Number(q.est_value) || 0) * ((Number(q.probability) || 0) / 100), 0)

  // Status + owner filters live in the URL so a working view survives navigation (#134).
  const statusFilter = params.get('status') || 'all'
  const ownerFilter = params.get('owner') || 'all'
  // A notification deep-link (?focus=) scrolls the linked inquiry into view (#139).
  const focusId = params.get('focus') || ''
  useEffect(() => {
    if (focusId) document.getElementById(`inq-${focusId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focusId, inquiries.data])
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params.toString())
    if (!v || v === 'all') n.delete(k)
    else n.set(k, v)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  // Owner options are the salespeople who actually have inquiries in view, so the
  // dropdown stays short and RLS-relevant (a rep only ever sees their own).
  const owners = useMemo(() => {
    const m = new Map<string, string>()
    for (const q of inquiries.data || []) if (q.sales_id) m.set(String(q.sales_id), q.salesperson?.name || String(q.sales_id))
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [inquiries.data])

  const filtered = useMemo(() => {
    let list = inquiries.data || []
    if (statusFilter !== 'all') list = list.filter((q: any) => q.status === statusFilter)
    if (ownerFilter !== 'all') list = list.filter((q: any) => String(q.sales_id) === ownerFilter)
    return list
  }, [inquiries.data, statusFilter, ownerFilter])

  // Default table order: open leads first (in stage order), closed last, then by
  // expected close. This is what useSort returns while no column is selected.
  const ordered = useMemo(() => {
    const rank = (s: string) => (OPEN_STAGES.includes(s) ? STAGES.indexOf(s) : 90 + STAGES.indexOf(s))
    return [...filtered].sort((a: any, b: any) => {
      const d = rank(a.status) - rank(b.status)
      if (d !== 0) return d
      return String(a.expected_close || '9999').localeCompare(String(b.expected_close || '9999'))
    })
  }, [filtered])

  // Click-to-sort over the filtered set. accessor maps a header key to a
  // comparable value; with no key selected the ordered default above is kept.
  const sortAccessor = (q: any, k: string) => {
    switch (k) {
      case 'company': return q.company
      case 'course': return q.course?.course_name
      case 'owner': return q.salesperson?.name
      case 'status': return STAGES.indexOf(q.status)
      case 'est_value': return Number(q.est_value) || 0
      case 'expected_close': return q.expected_close || ''
      default: return q[k]
    }
  }
  const tableSort = useSort(ordered, sortAccessor)
  const rows = tableSort.sorted

  if (inquiries.isLoading) return <TableSkeleton rows={6} cols={5} />
  if (inquiries.error) return <ErrorNote error={inquiries.error} />

  const total = (inquiries.data || []).length
  const won = byStage['Closed Won'].length

  return (
    <>
      <div className="page-head">
        {!embedded && (
          <div>
            <h1>Inquiry pipeline</h1>
            <p>{total} inquir{total === 1 ? 'y' : 'ies'}, {won} closed won. Weighted open pipeline {php(weighted)}. {isAdmin ? 'You see the whole team.' : 'You see your own.'}</p>
          </div>
        )}
        <div className="toolbar">
          {(['table', 'board'] as const).map((v) => (
            <button key={v} className={`btn btn-sm ${view === v ? '' : 'btn-ghost'}`} onClick={() => setView(v)}>
              {v === 'table' ? 'Table' : 'Board'}
            </button>
          ))}
          {canEdit && (
            <button className="btn" onClick={() => { setEditId(null); setCreating((c) => !c) }}>{creating ? 'Close' : '+ New inquiry'}</button>
          )}
        </div>
      </div>

      {canEdit && editId && (
        <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 720 }}>
          <div className="k-label" style={{ marginBottom: 10 }}>Edit inquiry</div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Company</span><input value={editForm.company} onChange={setE('company')} /></label>
            <label className="field"><span>Contact</span><input value={editForm.contact} onChange={setE('contact')} /></label>
            <label className="field"><span>Email</span><input type="email" value={editForm.email} onChange={setE('email')} /></label>
            <label className="field"><span>Phone</span><input value={editForm.phone} onChange={setE('phone')} /></label>
            <label className="field"><span>Course of interest</span>
              <Combobox ariaLabel="Course of interest" placeholder="Search a course…"
                options={courseOptions} value={editForm.course_id}
                onChange={(v) => setEditForm((f: any) => ({ ...f, course_id: v }))} />
            </label>
            <label className="field"><span>Offering</span>
              <select value={editForm.offering_type} onChange={setE('offering_type')}>
                {OFFERINGS.map((o) => (<option key={o}>{o}</option>))}
              </select>
            </label>
            <label className="field"><span>Estimated pax</span><input type="number" min="1" value={editForm.pax} onChange={setE('pax')} /></label>
            <label className="field"><span>Estimated value (PHP)</span><input type="number" min="0" value={editForm.est_value} onChange={setE('est_value')} /></label>
            <label className="field"><span>Win probability %</span><input type="number" min="0" max="100" value={editForm.probability} onChange={setE('probability')} /></label>
            <label className="field"><span>Expected close</span><input type="date" value={editForm.expected_close} onChange={setE('expected_close')} /></label>
            <label className="field"><span>Source</span>
              <select value={editForm.source} onChange={setE('source')}>
                <option value="">Not specified</option>
                {SOURCES.map((s) => (<option key={s}>{s}</option>))}
              </select>
            </label>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={saveEdit} disabled={busy}>{busy ? 'Saving…' : 'Save inquiry'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditId(null)}>Cancel</button>
          </div>
        </div>
      )}

      {canEdit && creating && (
        <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 720 }}>
          {/* Essentials — enough to log the lead and start working it. */}
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <Field label="Company" required error={createErrors.company} show={fe.shows('company')}
              hint={form.client_id ? 'Linked to an existing client — contact and email filled in.' : undefined}>
              <ClientTypeahead ariaLabel="Company" placeholder="Search existing clients or type a new company…"
                value={form.company} clients={(clients.data || []) as any[]} linked={!!form.client_id}
                inputProps={fe.inputProps('company', createErrors.company)}
                onTextChange={(text) => setForm((f: any) => ({ ...f, company: text, client_id: '' }))}
                onPick={(c) => setForm((f: any) => ({
                  ...f, client_id: c.client_id, company: c.company || c.name || '',
                  contact: f.contact.trim() || c.name || c.contact || '', email: f.email.trim() || c.email || '',
                }))} />
            </Field>
            <label className="field"><span>Contact</span><input value={form.contact} onChange={set('contact')} /></label>
            <Field label="Email" error={createErrors.email} show={fe.shows('email')}>
              <input type="email" value={form.email} onChange={set('email')} {...fe.inputProps('email', createErrors.email)} />
            </Field>
            <label className="field"><span>Course of interest</span>
              <Combobox ariaLabel="Course of interest" placeholder="Search a course…"
                options={courseOptions} value={form.course_id}
                onChange={(v) => setForm((f: any) => ({ ...f, course_id: v }))} />
            </label>
            {isAdmin && (
              <Field label="Salesperson" required error={createErrors.sales} show={fe.shows('sales')}>
                <select value={form.sales_id} onChange={set('sales_id')} {...fe.inputProps('sales', createErrors.sales)}>
                  <option value="">Select…</option>
                  {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
                </select>
              </Field>
            )}
          </div>

          {dupClient && (
            <div className="notice notice-warn" style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span>Looks like an existing client: <strong>{dupClient.company || dupClient.name}</strong>{dupClient.email ? ` · ${dupClient.email}` : ''}.</span>
              <button type="button" className="btn btn-sm" onClick={() => setForm((f: any) => ({
                ...f, client_id: dupClient.client_id, company: dupClient.company || dupClient.name || '',
                contact: f.contact.trim() || dupClient.name || dupClient.contact || '', email: f.email.trim() || dupClient.email || '',
              }))}>Link this client</button>
            </div>
          )}

          {/* Deal sizing / qualification — optional, folded by default. */}
          {!dealDetails ? (
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={false} style={{ marginTop: 4 }} onClick={() => setDealDetails(true)}>
              Add deal details — phone, offering, pax, value, probability, close, source
            </button>
          ) : (
            <>
              <div className="toolbar" style={{ margin: '4px 0 8px' }}>
                <button type="button" className="btn btn-ghost btn-sm" aria-expanded={true} onClick={() => setDealDetails(false)}>Hide deal details</button>
              </div>
              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <label className="field"><span>Phone</span><input value={form.phone} onChange={set('phone')} /></label>
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
              </div>
            </>
          )}
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={createInquiry} disabled={busy}>{busy ? 'Adding…' : 'Add inquiry'}</button>
          </div>
        </div>
      )}

      {view === 'table' && (
        <div className="filters">
          <select value={statusFilter} onChange={(e) => setParam('status', e.target.value)} aria-label="Filter by stage">
            <option value="all">All stages</option>
            {STAGES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
          {owners.length > 1 && (
            <select value={ownerFilter} onChange={(e) => setParam('owner', e.target.value)} aria-label="Filter by owner">
              <option value="all">All owners</option>
              {owners.map(([id, name]) => (<option key={id} value={id}>{name}</option>))}
            </select>
          )}
          {(statusFilter !== 'all' || ownerFilter !== 'all') && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setParam('status', 'all'); setParam('owner', 'all') }}>Clear filters</button>
          )}
          <span className="fill-label" style={{ alignSelf: 'center' }}>{rows.length} shown</span>
        </div>
      )}

      {view === 'table' ? (
        <div className="card">
          {rows.length === 0 ? <div className="empty">No inquiries match.</div> : (
          <div className="scroll-x">
          <table>
            <thead><tr>
              {([['company', 'Customer'], ['course', 'Training interest'], ['owner', 'Owner'], ['status', 'Stage']] as const).map(([key, label]) => (
                <th key={key} className="clickable" role="button" tabIndex={0}
                  aria-sort={tableSort.sort.key === key ? (tableSort.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  onClick={() => tableSort.toggle(key)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tableSort.toggle(key) } }}>
                  {label}{tableSort.indicator(key)}
                </th>
              ))}
              <th>Health</th>
              <th className="right clickable" role="button" tabIndex={0}
                aria-sort={tableSort.sort.key === 'est_value' ? (tableSort.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                onClick={() => tableSort.toggle('est_value')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tableSort.toggle('est_value') } }}>
                Est. value{tableSort.indicator('est_value')}
              </th>
              <th className="clickable" role="button" tabIndex={0}
                aria-sort={tableSort.sort.key === 'expected_close' ? (tableSort.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                onClick={() => tableSort.toggle('expected_close')}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tableSort.toggle('expected_close') } }}>
                Expected close{tableSort.indicator('expected_close')}
              </th>
              {canEdit && <th></th>}
            </tr></thead>
            <tbody>
              {rows.map((q: any) => {
                const i = STAGES.indexOf(q.status)
                const h = inquiryHealth(q)
                return (
                  <tr key={q.inquiry_id} id={`inq-${q.inquiry_id}`} className={String(q.inquiry_id) === focusId ? 'row-focus' : undefined}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{q.company}</div>
                      <div className="fill-label">{q.contact || '—'}{q.salesperson?.name ? '' : ''}</div>
                    </td>
                    <td className="fill-label">{q.course?.course_name || 'No course yet'}{q.pax ? ` · ${q.pax} pax` : ''}</td>
                    <td className="fill-label">{q.salesperson?.name || '—'}</td>
                    <td><span className="fill-label">{q.status}</span></td>
                    <td>{h ? <span className={`pill ${h.cls}`}>{h.label}</span> : '—'}</td>
                    <td className="right">{q.est_value ? php(q.est_value) : '—'}{q.probability != null ? <span className="fill-label"> · {q.probability}%</span> : ''}</td>
                    <td className="fill-label">{q.expected_close ? shortDate(q.expected_close) : '—'}</td>
                    {canEdit && (
                      <td className="right">
                        <div className="toolbar" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          <ConvertActions q={q} />
                          <button className="linkbtn" onClick={() => openEdit(q)}>Edit</button>
                          {q.status === 'Closed Lost' ? (
                            <button className="linkbtn" onClick={() => move(q.inquiry_id, 'Received')}>Reopen</button>
                          ) : (
                            <>
                              {i < 4 && <button className="btn btn-sm" title="Advance" onClick={() => move(q.inquiry_id, STAGES[i + 1])}>›</button>}
                              {OPEN_STAGES.includes(q.status) && <button className="linkbtn" onClick={() => markLost(q)}>Lost</button>}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
          )}
        </div>
      ) : (
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
                    {canEdit && (
                    <div className="toolbar" style={{ gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      <ConvertActions q={q} btn />
                      <button className="btn btn-ghost btn-sm" title="Edit inquiry" onClick={() => openEdit(q)}>Edit</button>
                      {stage === 'Closed Lost' ? (
                        <button className="btn btn-ghost btn-sm" title="Reopen" onClick={() => move(q.inquiry_id, 'Received')}>Reopen</button>
                      ) : (
                        <>
                          {i > 0 && <button className="btn btn-ghost btn-sm" title="Move back" aria-label="Move back a stage" onClick={() => move(q.inquiry_id, STAGES[i - 1])}>‹</button>}
                          {i < 4 && <button className="btn btn-sm" title="Advance" aria-label="Advance a stage" onClick={() => move(q.inquiry_id, STAGES[i + 1])}>›</button>}
                          {OPEN_STAGES.includes(stage) && <button className="btn btn-ghost btn-sm" title="Mark lost" onClick={() => markLost(q)}>Lost</button>}
                        </>
                      )}
                    </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      )}
    </>
  )
}
