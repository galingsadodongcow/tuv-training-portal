'use client'
import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useCourses, useCategoryTree, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { useToast } from '../components/Toast'
import { lt } from '../lib/labels'

const MODS = ['Live Online Training', 'Face-to-face', 'E-learning']
type ModState = Record<string, { on: boolean; price: string }>

// The course create/edit form. Standalone at /course/new and /course/[id]/edit,
// and hosted in the Training Catalogue edit-drawer (`onDone` + `courseId`) — the
// single fee-editing path (#13). When embedded, the drawer owns the heading and
// chrome and save/cancel just close it.
export default function CourseForm({ courseId, onDone }: { courseId?: string; onDone?: () => void } = {}) {
  const params = useParams()
  const embedded = !!onDone
  const id = (courseId ?? (params?.id as string | undefined)) || undefined
  const editing = !!id
  const courses = useCourses()
  const tree = useCategoryTree()
  const invalidate = useInvalidate()
  const router = useRouter()
  const toast = useToast()
  const [catId, setCatId] = useState('')
  const [f, setF] = useState({ course_name: '', category: '', subcategory_id: '', training_type: 'Professional', url: '', is_certification: false, max_pax: '', has_assessment: false, pass_mark: '', cert_validity_months: '' })
  const [mods, setMods] = useState<ModState>({ 'Live Online Training': { on: true, price: '' }, 'Face-to-face': { on: false, price: '' }, 'E-learning': { on: false, price: '' } })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(!editing)
  const [loadError, setLoadError] = useState<string | null>(null)
  // Certification / assessment / seat-cap / URL are advanced config — folded on a
  // new course (they all default), opened when editing so populated values show.
  const [advanced, setAdvanced] = useState(editing)

  useEffect(() => {
    if (!editing) return
    Promise.all([
      supabase.from('course').select('*').eq('course_id', id).single(),
      supabase.from('course_fee').select('modality, fee_php').eq('course_id', id),
    ]).then(([c, fe]: [any, any]) => {
      if (c.error || !c.data) { setLoadError(c.error?.message || 'Course not found'); setLoaded(true); return }
      if (fe.error) { setLoadError(fe.error.message); setLoaded(true); return }
      setF({ course_name: c.data.course_name, category: c.data.category || '', subcategory_id: c.data.subcategory_id || '', training_type: c.data.training_type, url: c.data.url || '', is_certification: !!c.data.is_certification, max_pax: c.data.max_pax != null ? String(c.data.max_pax) : '', has_assessment: !!c.data.has_assessment, pass_mark: c.data.pass_mark != null ? String(c.data.pass_mark) : '', cert_validity_months: c.data.cert_validity_months != null ? String(c.data.cert_validity_months) : '' })
      const next: ModState = { 'Live Online Training': { on: false, price: '' }, 'Face-to-face': { on: false, price: '' }, 'E-learning': { on: false, price: '' } }
      for (const row of fe.data || []) next[row.modality] = { on: true, price: String(row.fee_php) }
      setMods(next)
      setLoaded(true)
    })
  }, [editing, id])
  const set = (k: string) => (e: any) => setF((s) => ({ ...s, [k]: e.target.value }))

  const cats = [...new Set((courses.data || []).map((c: any) => c.category).filter(Boolean))].sort()

  // S6 hierarchy (falls back to the free-text category field when not live).
  const treeData: any[] = tree.data || []
  const hasTree = treeData.length > 0
  const allSubs = treeData.flatMap((c: any) => c.subcategories || [])
  const selectedSub = allSubs.find((s: any) => s.subcategory_id === f.subcategory_id)
  const effCat = catId || selectedSub?.category_id || ''
  const subsForCat = treeData.find((c: any) => c.category_id === effCat)?.subcategories || []

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const picked = MODS.filter((m) => mods[m].on)
      if (picked.length === 0) throw new Error('Pick at least one learning type.')
      for (const m of picked) {
        const p = Number(mods[m].price)
        if (mods[m].price === '' || !Number.isFinite(p) || p < 0) throw new Error(`Set a valid price for ${m}.`)
      }
      // When the hierarchy is live, the picked subcategory is the source of
      // truth and the free-text course.category column is retired (#23) — we no
      // longer write it. Only a legacy DB without the hierarchy uses the
      // free-text field.
      const body: any = {
        course_name: f.course_name.trim(),
        ...(hasTree ? {} : { category: f.category.trim() || null }),
        subcategory_id: hasTree ? (f.subcategory_id || null) : undefined,
        training_type: f.training_type, url: f.url.trim() || null,
        is_certification: f.is_certification, max_pax: f.max_pax === '' ? null : Number(f.max_pax),
        has_assessment: f.has_assessment, pass_mark: f.pass_mark === '' ? null : Number(f.pass_mark),
        cert_validity_months: f.cert_validity_months === '' ? null : Number(f.cert_validity_months),
      }
      if (body.subcategory_id === undefined) delete body.subcategory_id
      // Retry without the newer columns if the migrations that add them are not
      // applied yet, so course editing never breaks (strip-and-retry on 42703).
      const missingColumn = (e: any) => !!e && (e.code === '42703' || /column .* does not exist/i.test(e.message || ''))
      const stripped = (o: any) => { const { is_certification, max_pax, has_assessment, pass_mark, cert_validity_months, subcategory_id, ...rest } = o; return rest }
      let courseId: any = id
      if (editing) {
        let { error } = await supabase.from('course').update(body).eq('course_id', id)
        if (error && missingColumn(error)) ({ error } = await supabase.from('course').update(stripped(body)).eq('course_id', id))
        if (error) throw error
      } else {
        let res = await supabase.from('course').insert(body).select('course_id').single()
        if (res.error && missingColumn(res.error)) res = await supabase.from('course').insert(stripped(body)).select('course_id').single()
        if (res.error) throw res.error
        courseId = res.data.course_id
      }
      // Upsert the selected fees first, then remove only the de-selected modalities.
      // This avoids the previous delete-then-insert window that could leave a
      // course with zero fees if the insert failed. (Needs a unique constraint
      // on course_fee(course_id, modality).)
      const feeRows = picked.map((m) => ({ course_id: courseId, modality: m, fee_php: Number(mods[m].price) }))
      const { error: upErr } = await supabase.from('course_fee').upsert(feeRows, { onConflict: 'course_id,modality' })
      if (upErr) throw upErr
      const removed = MODS.filter((m) => !mods[m].on)
      if (removed.length) {
        const { error: delErr } = await supabase.from('course_fee').delete().eq('course_id', courseId).in('modality', removed)
        if (delErr) throw delErr
      }
      invalidate(['courses', 'course_fees'])
      toast.success(editing ? 'Course saved.' : 'Course created.')
      if (onDone) onDone()
      else router.push(editing ? '/calendar' : '/courses')
    } catch (err: any) {
      setMsg(err.message)
      toast.error(err.message)
      setBusy(false)
    }
  }

  if (courses.isLoading || !loaded) return <Spinner label="Loading" />
  if (loadError) return <ErrorNote error={loadError} />

  const form = (
        <form onSubmit={submit}>
          <label className="field"><span>Training title</span>
            <input value={f.course_name} onChange={set('course_name')} required />
          </label>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {hasTree ? (
              <>
                <label className="field"><span>Category</span>
                  <select value={effCat} onChange={(e) => { setCatId(e.target.value); setF((s) => ({ ...s, subcategory_id: '' })) }}>
                    <option value="">— none —</option>
                    {treeData.map((c: any) => (<option key={c.category_id} value={c.category_id}>{c.name}</option>))}
                  </select>
                </label>
                <label className="field"><span>Subcategory</span>
                  <select value={f.subcategory_id} disabled={!effCat} onChange={(e) => setF((s) => ({ ...s, subcategory_id: e.target.value }))}>
                    <option value="">— none —</option>
                    {subsForCat.map((s: any) => (<option key={s.subcategory_id} value={s.subcategory_id}>{s.name}</option>))}
                  </select>
                </label>
              </>
            ) : (
              <label className="field"><span>Subject category</span>
                <input list="cats" value={f.category} onChange={set('category')} placeholder="e.g. Occupational Health and Safety" />
                <datalist id="cats">{cats.map((c: any) => (<option key={c} value={c} />))}</datalist>
              </label>
            )}
            <label className="field"><span>Training type</span>
              <select value={f.training_type} onChange={set('training_type')}>
                <option>Professional</option>
                <option>PersCert</option>
              </select>
            </label>
          </div>
          <div className="field">
            <button type="button" className="btn btn-ghost btn-sm" aria-expanded={advanced} onClick={() => setAdvanced((v) => !v)}>
              {advanced ? 'Hide advanced' : 'Advanced — certification, assessment, seat cap, URL'}
            </button>
          </div>
          {advanced && (<>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', alignItems: 'end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={f.is_certification} style={{ width: 'auto' }}
                onChange={(e) => setF((s) => ({ ...s, is_certification: e.target.checked }))} />
              Certification course (caps seats at 10)
            </label>
            <label className="field"><span>Max seats override (optional)</span>
              <input type="number" min="8" value={f.max_pax} onChange={set('max_pax')}
                placeholder={f.is_certification ? '10' : '20'} />
            </label>
          </div>
          <div className="fill-label" style={{ marginTop: -4, marginBottom: 6 }}>
            Minimum is 8 for every course. The cap is 10 for a certification course and 20 otherwise, unless you set an override.
          </div>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', alignItems: 'end' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={f.has_assessment} style={{ width: 'auto' }}
                onChange={(e) => setF((s) => ({ ...s, has_assessment: e.target.checked }))} />
              Has an assessment
            </label>
            <label className="field"><span>Pass mark</span>
              <input type="number" min={0} max={100} step={1} value={f.pass_mark} onChange={set('pass_mark')} disabled={!f.has_assessment} placeholder="e.g. 70" />
            </label>
            <label className="field"><span>Cert valid (months)</span>
              <input type="number" min="1" value={f.cert_validity_months} onChange={set('cert_validity_months')} placeholder="e.g. 36" />
            </label>
          </div>
          <div className="fill-label" style={{ marginTop: -4, marginBottom: 6 }}>
            When a course has an assessment, a certificate needs a Pass result. Validity sets the certificate expiry.
          </div>
          <label className="field"><span>Webshop URL</span>
            <input type="url" value={f.url} onChange={set('url')} placeholder="https://academy-ph.tuv.com/product/…" />
          </label>
          </>)}

          <div className="k-label" style={{ margin: '6px 0 8px' }}>Learning types and fees (PHP, excl. VAT)</div>
          {MODS.map((m) => (
            <div key={m} className="toolbar" style={{ marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 200 }}>
                <input type="checkbox" checked={mods[m].on} style={{ width: 'auto' }}
                  onChange={(e) => setMods((s) => ({ ...s, [m]: { ...s[m], on: e.target.checked } }))} />
                {lt(m)}
              </label>
              <input type="number" min="0" placeholder="Fee" value={mods[m].price} disabled={!mods[m].on}
                onChange={(e) => setMods((s) => ({ ...s, [m]: { ...s[m], price: e.target.value } }))} style={{ maxWidth: 140 }} />
            </div>
          ))}

          {msg && <div className="notice notice-error" style={{ margin: '12px 0' }}>{msg}</div>}
          <div className="toolbar" style={{ marginTop: 10 }}>
            <button className="btn" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create course'}</button>
            <button type="button" className="btn btn-ghost" onClick={() => (onDone ? onDone() : router.push('/calendar'))}>Cancel</button>
          </div>
        </form>
  )

  if (embedded) return form

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{editing ? 'Edit course' : 'New course'}</h1>
          <p>A course holds many sessions and sells in one or more learning types, each with its own fee.</p>
        </div>
      </div>
      <div className="card card-pad" style={{ maxWidth: 620 }}>{form}</div>
    </>
  )
}
