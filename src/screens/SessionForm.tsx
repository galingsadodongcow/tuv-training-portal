'use client'
import { useState, useMemo, useEffect } from 'react'
import { useRouter, useParams, useSearchParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useCourses, useCourseFees, useActiveYear, useSalespeople, useInvalidate, useTrainers, useVenues, checkConflicts, useTrainerCourseMap, useSessionTrainers } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import DateSegments, { SegError } from '../components/DateSegments'
import { useToast } from '../components/Toast'
import { php } from '../lib/format'
import { LEARNING_TYPES, lt, segmentsDays } from '../lib/labels'
import { MIN_PAX, maxPaxFor, isIrcaCourse } from '../lib/pax'

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
  const tcMap = useTrainerCourseMap()
  const sessionTrainers = useSessionTrainers(editing ? id : undefined)
  const invalidate = useInvalidate()
  const router = useRouter()
  const toast = useToast()

  const [f, setF] = useState<any>({
    course_id: '', modality: 'Live Online Training',
    min_participants: MIN_PAX, max_participants: '', sales_owner: '', private_run: false, status: 'Tentative', price: '', trainer_id: '', venue_id: '',
  })
  const [segments, setSegments] = useState<any[]>([{ start: '', end: '' }])
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [conflicts, setConflicts] = useState<any[]>([])
  const [checking, setChecking] = useState(false)
  const [loaded, setLoaded] = useState(!editing && !cloneId)
  const set = (k: string) => (e: any) => setF((s: any) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  // Picking a course seeds the per-session pax defaults from that course. The
  // operator can still override either number in the fields below.
  const onCourseChange = (e: any) => {
    const course_id = e.target.value
    const course = (courses.data || []).find((c: any) => c.course_id === course_id) || null
    setF((s: any) => ({ ...s, course_id, min_participants: MIN_PAX, max_participants: maxPaxFor(course) }))
  }

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
      // On load failure, still clear the loading gate so the form renders and can
      // show the error — otherwise the Spinner stays up forever and msg is hidden.
      if (error || !data) { setMsg(error?.message || 'Session not found'); setLoaded(true); return }
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

  // Pax defaults come from the course (minimum 8 for every course, maximum 20
  // for professional and 10 for IRCA), but each run can override them — the DB
  // now honours the per-session cap, so we submit the form's values.
  const selectedCourse = useMemo(
    () => (courses.data || []).find((c: any) => c.course_id === f.course_id) || null,
    [courses.data, f.course_id]
  )
  const maxPax = maxPaxFor(selectedCourse)
  const irca = isIrcaCourse(selectedCourse?.course_name)

  // Monotonic date guard (roadmap #29). Hard error: a block whose end falls
  // before its start — this blocks submit. Soft warning: a block that starts
  // before the previous block ends (out of order / overlapping). ISO date
  // strings sort lexicographically, so a plain string compare is correct.
  const segErrors = useMemo<SegError[]>(
    () =>
      segments.map((s: any, i: number) => {
        if (s.start && s.end && s.end < s.start) {
          return { level: 'error', msg: "End date can't be before the start date." }
        }
        const prev = segments[i - 1]
        if (prev && prev.end && s.start && s.start < prev.end) {
          return { level: 'warn', msg: 'This block starts before the previous one ends.' }
        }
        return null
      }),
    [segments]
  )
  const hasDateError = segErrors.some((e) => e?.level === 'error')

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
        private_run: f.private_run,
        min_participants: f.min_participants === '' ? MIN_PAX : Number(f.min_participants),
        status: f.status, sales_owner: f.sales_owner || null,
        max_participants: f.max_participants === '' ? maxPax : Number(f.max_participants),
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

  const assistantIds = new Set((sessionTrainers.data || []).map((s: any) => s.trainer_id))
  const toggleAssistant = async (trainerId: string, on: boolean) => {
    const { error } = on
      ? await supabase.from('session_trainer').insert({ schedule_id: id, trainer_id: trainerId, role: 'Assistant' })
      : await supabase.from('session_trainer').delete().eq('schedule_id', id).eq('trainer_id', trainerId)
    if (error) { toast.error(error.message); return }
    invalidate(['session_trainers'])
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
            <select value={f.course_id} onChange={onCourseChange} required>
              <option value="">Select a course…</option>
              {courses.data.map((c: any) => (
                <option key={c.course_id} value={c.course_id}>{c.course_name} ({c.training_type})</option>
              ))}
            </select>
          </label>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Learning type</span>
              {/* E-learning has no scheduled session (submit rejects it), so keep it out of the picker. */}
              <select value={f.modality} onChange={set('modality')}>
                {LEARNING_TYPES.filter((m) => m !== 'E-learning').map((m) => (<option key={m} value={m}>{lt(m)}</option>))}
              </select>
            </label>
            <label className="field"><span>Fee (blank uses catalog: {feeForPick != null ? php(feeForPick) : 'no fee set'})</span>
              <input type="number" min="0" value={f.price} onChange={set('price')} placeholder={feeForPick ?? ''} />
            </label>
          </div>

          <div className="field">
            <span style={{ display: 'block', fontSize: 12, color: 'var(--tr-slate)', marginBottom: 5, fontWeight: 600 }}>Dates</span>
            <DateSegments segments={segments} onChange={setSegments} errors={segErrors} />
          </div>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Minimum pax (Go threshold)</span>
              <input type="number" min="1" value={f.min_participants} onChange={set('min_participants')} />
            </label>
            <label className="field"><span>Maximum pax</span>
              <input type="number" min="1" value={f.max_participants} onChange={set('max_participants')} />
            </label>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <div className="fill-label">
                Defaults from the course (min {MIN_PAX}, max {maxPax} for {irca ? 'IRCA courses' : 'professional trainings'}) — override per session if this run differs.
              </div>
            </div>
            <label className="field"><span>Sales owner</span>
              <select value={f.sales_owner} onChange={set('sales_owner')}>
                <option value="">Unassigned</option>
                {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
              </select>
            </label>
            <label className="field"><span>Trainer</span>
              <select value={f.trainer_id} onChange={set('trainer_id')}>
                <option value="">Not assigned yet</option>
                {trainers.data?.map((t: any) => {
                  const qualified = (tcMap.data || []).some((m: any) => m.trainer_id === t.trainer_id && m.course_id === f.course_id)
                  return <option key={t.trainer_id} value={t.trainer_id}>{t.name} ({t.trainer_type}){f.course_id && qualified ? ' · qualified' : ''}</option>
                })}
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
              {/* Running / Completed / Cancelled are driven by actions and dates
                  (Close, Cancel, nightly hygiene) — hand-setting them here would
                  bypass fn_close_session, so only the planning states are editable. */}
              {['Running', 'Completed', 'Cancelled'].includes(f.status) ? (
                <>
                  <input type="text" value={f.status} readOnly disabled />
                  <span className="fill-label" style={{ marginTop: 4 }}>Set by session actions (Close, Cancel, hygiene), not editable here.</span>
                </>
              ) : (
                <select value={f.status} onChange={set('status')}>
                  {['Tentative', 'Confirmed'].map((s) => (<option key={s}>{s}</option>))}
                </select>
              )}
            </label>
            <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
              <input type="checkbox" checked={f.private_run} onChange={set('private_run')} style={{ width: 'auto' }} />
              <span style={{ margin: 0 }}>Private run (closed in-house)</span>
            </label>
          </div>

          {editing && (
            <div className="drawer-section" style={{ marginBottom: 12 }}>
              <div className="k-label" style={{ marginBottom: 6 }}>Co-trainers (assistants)</div>
              <div className="chip-row" style={{ gap: 12 }}>
                {(trainers.data || []).filter((t: any) => t.trainer_id !== f.trainer_id).map((t: any) => (
                  <label key={t.trainer_id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" style={{ width: 'auto' }} checked={assistantIds.has(t.trainer_id)} onChange={(e) => toggleAssistant(t.trainer_id, e.target.checked)} />
                    {t.name}
                  </label>
                ))}
              </div>
            </div>
          )}

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
            <button className="btn" disabled={busy || conflicts.length > 0 || hasDateError}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create session'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => router.push('/calendar')}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  )
}
