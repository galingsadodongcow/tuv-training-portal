'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useCourses, useCourseFees, useActiveYear, useSalespeople, useInvalidate, useTrainers, useVenues, checkConflicts } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import DateSegments from '../components/DateSegments'
import { useToast } from '../components/Toast'
import { php } from '../lib/format'
import { LEARNING_TYPES, lt, segmentsDays } from '../lib/labels'

export default function SessionForm() {
  const params = useParams()
  const id = (params?.id as string | undefined) || undefined
  const sp = useSearchParams()
  const cloneId = sp.get('clone')
  const editing = !!id
  const courses = useCourses()
  const fees = useCourseFees()
  const years = useActiveYear()
  const people = useSalespeople()
  const trainers = useTrainers()
  const venues = useVenues()
  const invalidate = useInvalidate()
  const router = useRouter()
  const toast = useToast()

  const [f, setF] = useState<any>({
    course_id: '', modality: 'Live Online Training',
    min_participants: 1, max_participants: '', sales_owner: '', private_run: false, status: 'Tentative', price: '', trainer_id: '', venue_id: '',
  })
  const [segments, setSegments] = useState<any[]>([{ start: '', end: '' }])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<any[]>([])
  const [checking, setChecking] = useState(false)
  const [loaded, setLoaded] = useState(!editing && !cloneId)
  const set = (k: string) => (e: any) => setF((s: any) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  useEffect(() => {
    if (cloneId && !editing) {
      supabase.from('schedule').select('*').eq('schedule_id', cloneId).single().then(({ data }) => {
        if (data) {
          setF({
            course_id: data.course_id, modality: data.modality,
            min_participants: data.min_participants, max_participants: data.max_participants ?? '', sales_owner: data.sales_owner || '',
            private_run: data.private_run, status: 'Tentative', price: data.price ?? '', trainer_id: data.trainer_id || '', venue_id: data.venue_id || '',
          })
        }
        setLoaded(true)
      })
      return
    }
    if (!editing) return
    supabase.from('schedule').select('*').eq('schedule_id', id).single().then(({ data, error }) => {
      if (error || !data) { setMsg(error?.message || 'Session not found'); return }
      setF({
        course_id: data.course_id, modality: data.modality,
        min_participants: data.min_participants, max_participants: data.max_participants ?? '', sales_owner: data.sales_owner || '',
        private_run: data.private_run, status: data.status, price: data.price ?? '', trainer_id: data.trainer_id || '', venue_id: data.venue_id || '',
      })
      setSegments(data.date_segments?.length ? data.date_segments : [{ start: data.start_date, end: data.end_date }])
      setLoaded(true)
    })
  }, [editing, id, cloneId])

  useEffect(() => {
    const segs = segments.filter((s) => s.start).map((s) => ({ start: s.start, end: s.end || s.start }))
    if (segs.length === 0 || (!f.trainer_id && !f.venue_id)) { setConflicts([]); return }
    const sorted = [...segs].sort((a, b) => a.start.localeCompare(b.start))
    let cancelled = false
    setChecking(true)
    checkConflicts({
      scheduleId: id || null,
      trainerId: f.trainer_id || null,
      venueId: f.venue_id || null,
      start: sorted[0].start,
      end: sorted[sorted.length - 1].end,
      segments: sorted,
    })
      .then((rows) => { if (!cancelled) setConflicts(rows || []) })
      .catch(() => { if (!cancelled) setConflicts([]) })
      .finally(() => { if (!cancelled) setChecking(false) })
    return () => { cancelled = true }
  }, [f.trainer_id, f.venue_id, segments, id])

  const feeForPick = useMemo(() => {
    if (!fees.data || !f.course_id) return null
    return fees.data.find((x: any) => x.course_id === f.course_id && x.modality === f.modality)?.fee_php ?? null
  }, [fees.data, f.course_id, f.modality])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      if (f.modality === 'E-learning') throw new Error('E-learning has no scheduled session. Sell it as a course order instead.')
      const segs = segments.filter((s) => s.start).map((s) => ({ start: s.start, end: s.end || s.start }))
      if (segs.length === 0) throw new Error('Set at least one date block.')
      for (const s of segs) if (s.end < s.start) throw new Error('A block ends before it starts.')
      const sorted = [...segs].sort((a, b) => a.start.localeCompare(b.start))
      const start_date = sorted[0].start
      const end_date = sorted[sorted.length - 1].end
      const month = new Date(start_date).toLocaleDateString('en-PH', { month: 'long' })
      const payload = {
        course_id: f.course_id, month, start_date, end_date,
        date_segments: sorted, modality: f.modality,
        private_run: f.private_run, min_participants: Number(f.min_participants),
        status: f.status, sales_owner: f.sales_owner || null,
        max_participants: f.max_participants === '' ? null : Number(f.max_participants),
        trainer_id: f.trainer_id || null,
        venue_id: f.venue_id || null,
        duration_days: segmentsDays(sorted),
        price: f.price === '' ? null : Number(f.price),
      }
      let error
      if (editing) {
        ;({ error } = await supabase.from('schedule').update(payload).eq('schedule_id', id))
      } else {
        const year = years.data?.[0]
        if (!year) throw new Error('No active calendar year. Create one under Annual rollover first.')
        ;({ error } = await supabase.from('schedule').insert({ ...payload, year_id: year.year_id }))
      }
      if (error) throw error
      invalidate(['schedules', 'open_schedules', 'channel_pax'])
      toast.success(editing ? 'Session saved.' : 'Session created.')
      router.push('/calendar')
    } catch (err: any) {
      setMsg(err.message)
      toast.error(err.message)
      setBusy(false)
    }
  }

  if (courses.isLoading || years.isLoading || !loaded) return <Spinner label="Loading" />
  if (courses.error) return <ErrorNote error={courses.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{editing ? 'Edit session' : cloneId ? 'Clone session' : 'New session'}</h1>
          <p>{editing ? 'Change any detail, including staggered dates.' : cloneId ? 'Everything copied except the dates. Set the new dates and save.' : 'Schedules a course run. Fee defaults from the course catalog for the chosen learning type.'}</p>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 640 }}>
        <form onSubmit={submit}>
          <label className="field"><span>Course</span>
            <select value={f.course_id} onChange={set('course_id')} required>
              <option value="">Select a course…</option>
              {courses.data.map((c: any) => (
                <option key={c.course_id} value={c.course_id}>{c.course_name} ({c.training_type})</option>
              ))}
            </select>
          </label>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Learning type</span>
              <select value={f.modality} onChange={set('modality')}>
                {LEARNING_TYPES.map((m) => (<option key={m} value={m}>{lt(m)}</option>))}
              </select>
            </label>
            <label className="field"><span>Fee (blank uses catalog: {feeForPick != null ? php(feeForPick) : 'no fee set'})</span>
              <input type="number" min="0" value={f.price} onChange={set('price')} placeholder={feeForPick ?? ''} />
            </label>
          </div>

          <div className="field">
            <span style={{ display: 'block', fontSize: 12, color: 'var(--tr-slate)', marginBottom: 5, fontWeight: 600 }}>Dates</span>
            <DateSegments segments={segments} onChange={setSegments} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Minimum pax (Go threshold)</span>
              <input type="number" min="1" value={f.min_participants} onChange={set('min_participants')} required />
            </label>
            <label className="field"><span>Maximum pax (blank = no limit)</span>
              <input type="number" min="1" value={f.max_participants} onChange={set('max_participants')} placeholder="e.g. 20" />
            </label>
            <label className="field"><span>Sales owner</span>
              <select value={f.sales_owner} onChange={set('sales_owner')}>
                <option value="">Unassigned</option>
                {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
              </select>
            </label>
            <label className="field"><span>Trainer</span>
              <select value={f.trainer_id} onChange={set('trainer_id')}>
                <option value="">Not assigned yet</option>
                {trainers.data?.map((t: any) => (<option key={t.trainer_id} value={t.trainer_id}>{t.name} ({t.trainer_type})</option>))}
              </select>
            </label>
            <label className="field"><span>Venue</span>
              <select value={f.venue_id} onChange={set('venue_id')}>
                <option value="">Not assigned yet</option>
                {venues.data?.map((v: any) => (
                  <option key={v.venue_id} value={v.venue_id}>
                    {v.name}{v.capacity ? ` (holds ${v.capacity})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="field"><span>Status</span>
              <select value={f.status} onChange={set('status')}>
                {['Tentative', 'Confirmed', 'Running', 'Completed'].map((s) => (<option key={s}>{s}</option>))}
              </select>
            </label>
            <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
              <input type="checkbox" checked={f.private_run} onChange={set('private_run')} style={{ width: 'auto' }} />
              <span style={{ margin: 0 }}>Private run (closed in-house)</span>
            </label>
          </div>

          {checking && <div className="fill-label" style={{ marginBottom: 8 }}>Checking availability…</div>}
          {conflicts.length > 0 && (
            <div className="notice notice-error" style={{ marginBottom: 12 }}>
              <strong>Double booking</strong>
              <ul style={{ margin: '6px 0 0 16px', padding: 0 }}>
                {[...new Map(conflicts.map((c) => [`${c.conflict_type}-${c.course_name}`, c])).values()].map((c: any, i) => (
                  <li key={i}>
                    {c.conflict_type} is already on "{c.course_name}" on {new Date(c.clash_day).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}
          <div className="toolbar">
            <button className="btn" disabled={busy || conflicts.length > 0}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create session'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => router.push('/calendar')}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  )
}
