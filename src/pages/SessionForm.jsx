import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCourses, useCourseFees, useActiveYear, useSalespeople, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { php } from '../lib/format'

const MODALITIES = ['Live Online Training', 'Face-to-face', 'E-learning']

export default function SessionForm() {
  const courses = useCourses()
  const fees = useCourseFees()
  const years = useActiveYear()
  const people = useSalespeople()
  const invalidate = useInvalidate()
  const nav = useNavigate()

  const [f, setF] = useState({
    course_id: '', modality: 'Live Online Training', start_date: '', end_date: '',
    min_participants: 1, sales_owner: '', private_run: false, status: 'Tentative',
  })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const feeForPick = useMemo(() => {
    if (!fees.data || !f.course_id) return null
    const hit = fees.data.find((x) => x.course_id === f.course_id && x.modality === f.modality)
    return hit?.fee_php ?? null
  }, [fees.data, f.course_id, f.modality])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const year = years.data?.[0]
      if (!year) throw new Error('No active calendar year. Create one under Annual rollover first.')
      if (f.modality === 'E-learning') throw new Error('E-learning has no scheduled session. Sell it as a course order instead.')
      const month = new Date(f.start_date).toLocaleDateString('en-PH', { month: 'long' })
      const { error } = await supabase.from('schedule').insert({
        course_id: f.course_id,
        year_id: year.year_id,
        month,
        start_date: f.start_date,
        end_date: f.end_date || f.start_date,
        modality: f.modality,
        private_run: f.private_run,
        min_participants: Number(f.min_participants),
        status: f.status,
        sales_owner: f.sales_owner || null,
      })
      if (error) throw error
      invalidate(['schedules', 'open_schedules', 'channel_pax'])
      nav('/calendar')
    } catch (err) {
      setMsg(err.message)
      setBusy(false)
    }
  }

  if (courses.isLoading || years.isLoading) return <Spinner label="Loading" />
  if (courses.error) return <ErrorNote error={courses.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New session</h1>
          <p>Schedules a course run. Price defaults from the course fee for the chosen modality.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 620 }}>
        <form onSubmit={submit}>
          <label className="field"><span>Course</span>
            <select value={f.course_id} onChange={set('course_id')} required>
              <option value="">Select a course…</option>
              {courses.data.map((c) => (
                <option key={c.course_id} value={c.course_id}>{c.course_name} ({c.training_type})</option>
              ))}
            </select>
          </label>

          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Modality</span>
              <select value={f.modality} onChange={set('modality')}>
                {MODALITIES.map((m) => (<option key={m}>{m}</option>))}
              </select>
            </label>
            <label className="field"><span>Fee (from catalog)</span>
              <input value={feeForPick != null ? php(feeForPick) : '— no fee set —'} disabled />
            </label>
            <label className="field"><span>Start date</span>
              <input type="date" value={f.start_date} onChange={set('start_date')} required />
            </label>
            <label className="field"><span>End date</span>
              <input type="date" value={f.end_date} onChange={set('end_date')} />
            </label>
            <label className="field"><span>Minimum pax</span>
              <input type="number" min="1" value={f.min_participants} onChange={set('min_participants')} required />
            </label>
            <label className="field"><span>Sales owner</span>
              <select value={f.sales_owner} onChange={set('sales_owner')}>
                <option value="">Unassigned</option>
                {people.data?.map((p) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
              </select>
            </label>
            <label className="field"><span>Status</span>
              <select value={f.status} onChange={set('status')}>
                {['Tentative', 'Confirmed'].map((s) => (<option key={s}>{s}</option>))}
              </select>
            </label>
            <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22 }}>
              <input type="checkbox" checked={f.private_run} onChange={set('private_run')} style={{ width: 'auto' }} />
              <span style={{ margin: 0 }}>Private run (closed in-house)</span>
            </label>
          </div>

          {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}
          <div className="toolbar">
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Create session'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => nav('/calendar')}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  )
}
