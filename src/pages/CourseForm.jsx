import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCourses, useInvalidate } from '../hooks/data'
import { Spinner } from '../components/ui'

const MODS = ['Live Online Training', 'Face-to-face', 'E-learning']

export default function CourseForm() {
  const courses = useCourses()
  const invalidate = useInvalidate()
  const nav = useNavigate()
  const [f, setF] = useState({ course_name: '', category: '', training_type: 'Professional', url: '' })
  const [mods, setMods] = useState({ 'Live Online Training': { on: true, price: '' }, 'Face-to-face': { on: false, price: '' }, 'E-learning': { on: false, price: '' } })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const cats = [...new Set((courses.data || []).map((c) => c.category).filter(Boolean))].sort()

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const picked = MODS.filter((m) => mods[m].on)
      if (picked.length === 0) throw new Error('Pick at least one learning type.')
      for (const m of picked) if (mods[m].price === '' || Number(mods[m].price) < 0) throw new Error(`Set a price for ${m}.`)
      const { data: course, error } = await supabase
        .from('course')
        .insert({ course_name: f.course_name.trim(), category: f.category.trim() || null, training_type: f.training_type, url: f.url.trim() || null })
        .select('course_id')
        .single()
      if (error) throw error
      const feeRows = picked.map((m) => ({ course_id: course.course_id, modality: m, fee_php: Number(mods[m].price) }))
      const { error: fErr } = await supabase.from('course_fee').insert(feeRows)
      if (fErr) throw fErr
      invalidate(['courses', 'course_fees'])
      nav('/calendar')
    } catch (err) {
      setMsg(err.message)
      setBusy(false)
    }
  }

  if (courses.isLoading) return <Spinner label="Loading" />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>New course</h1>
          <p>A course holds many sessions and sells in one or more learning types, each with its own fee.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 620 }}>
        <form onSubmit={submit}>
          <label className="field"><span>Training title</span>
            <input value={f.course_name} onChange={set('course_name')} required />
          </label>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Subject category</span>
              <input list="cats" value={f.category} onChange={set('category')} placeholder="e.g. Occupational Health and Safety" />
              <datalist id="cats">{cats.map((c) => (<option key={c} value={c} />))}</datalist>
            </label>
            <label className="field"><span>Training category</span>
              <select value={f.training_type} onChange={set('training_type')}>
                <option>Professional</option>
                <option>PersCert</option>
              </select>
            </label>
          </div>
          <label className="field"><span>Webshop URL</span>
            <input type="url" value={f.url} onChange={set('url')} placeholder="https://academy-ph.tuv.com/product/…" />
          </label>

          <div className="k-label" style={{ margin: '6px 0 8px' }}>Learning types and fees (PHP, excl. VAT)</div>
          {MODS.map((m) => (
            <div key={m} className="toolbar" style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                <input type="checkbox" checked={mods[m].on} style={{ width: 'auto' }}
                  onChange={(e) => setMods((s) => ({ ...s, [m]: { ...s[m], on: e.target.checked } }))} />
                {m}
              </label>
              <input type="number" min="0" placeholder="Fee" value={mods[m].price} disabled={!mods[m].on}
                onChange={(e) => setMods((s) => ({ ...s, [m]: { ...s[m], price: e.target.value } }))} style={{ maxWidth: 140 }} />
            </div>
          ))}

          {msg && <div className="notice notice-error" style={{ margin: '12px 0' }}>{msg}</div>}
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Create course'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => nav('/calendar')}>Cancel</button>
          </div>
        </form>
      </div>
    </>
  )
}
