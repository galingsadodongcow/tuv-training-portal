'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useCourses, useCourseFees, useInvalidate } from '../hooks/data'
import { ErrorNote } from '../components/ui'
import { TableSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { php } from '../lib/format'
import { lt } from '../lib/labels'

const MODS = ['Live Online Training', 'Face-to-face', 'E-learning']

// Course catalog: every course with its price per learning type, editable in
// place. Prices live in course_fee, one row per course and learning type, so a
// course can carry a different fee for classroom, virtual, and e-learning.
export default function Courses() {
  const courses = useCourses()
  const fees = useCourseFees()
  const invalidate = useInvalidate()
  const toast = useToast()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({})
  const [busy, setBusy] = useState<string | null>(null)

  // feeMap[course_id][modality] = fee
  const feeMap = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const f of fees.data || []) {
      m[f.course_id] = m[f.course_id] || {}
      m[f.course_id][f.modality] = f.fee_php
    }
    return m
  }, [fees.data])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = courses.data || []
    if (!t) return list
    return list.filter((c: any) =>
      c.course_name?.toLowerCase().includes(t) || c.category?.toLowerCase().includes(t))
  }, [courses.data, q])

  const cellValue = (cid: string, m: string) =>
    draft[cid]?.[m] ?? (feeMap[cid]?.[m] != null ? String(feeMap[cid][m]) : '')

  const setCell = (cid: string, m: string, v: string) =>
    setDraft((d) => ({ ...d, [cid]: { ...(d[cid] || {}), [m]: v } }))

  const dirty = (cid: string) => {
    const d = draft[cid]
    if (!d) return false
    return Object.keys(d).some((m) => (d[m] ?? '') !== (feeMap[cid]?.[m] != null ? String(feeMap[cid][m]) : ''))
  }

  const saveRow = async (cid: string) => {
    const upserts: any[] = []
    const removeMods: string[] = []
    try {
      for (const m of MODS) {
        const raw = cellValue(cid, m).trim()
        if (raw === '') {
          if (feeMap[cid]?.[m] != null) removeMods.push(m)
          continue
        }
        const n = Number(raw)
        if (!Number.isFinite(n) || n < 0) throw new Error(`Set a valid price for ${lt(m)}.`)
        upserts.push({ course_id: cid, modality: m, fee_php: n })
      }
    } catch (err: any) {
      toast.error(err.message)
      return
    }
    // Blanking a cell deletes a previously-set fee — confirm before removing it.
    if (removeMods.length) {
      const res = await confirm({
        title: `Remove ${removeMods.length} saved price${removeMods.length === 1 ? '' : 's'}?`,
        body: `Clearing a price deletes that fee for ${removeMods.map(lt).join(', ')}. The course will show no price for that learning type.`,
        confirmLabel: 'Remove prices',
        tone: 'danger',
      })
      if (!res.ok) return
    }
    setBusy(cid)
    try {
      if (upserts.length) {
        const { error } = await supabase.from('course_fee').upsert(upserts, { onConflict: 'course_id,modality' })
        if (error) throw error
      }
      if (removeMods.length) {
        const { error } = await supabase.from('course_fee').delete().eq('course_id', cid).in('modality', removeMods)
        if (error) throw error
      }
      setDraft((d) => { const next = { ...d }; delete next[cid]; return next })
      invalidate(['course_fees'])
      toast.success('Prices saved.')
    } catch (err: any) {
      toast.error(err.message)
    }
    setBusy(null)
  }

  if (courses.isLoading || fees.isLoading) return <TableSkeleton rows={10} cols={6} />
  if (courses.error) return <ErrorNote error={courses.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Courses and pricing</h1>
          <p>Every course and its fee per learning type, excl. VAT. Edit a price in place and save the row.</p>
        </div>
        <div className="toolbar">
          <Link className="btn" href="/course/new">+ New course</Link>
        </div>
      </div>

      <div className="filters">
        <input placeholder="Search course or category…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
      </div>

      {fees.error && <ErrorNote error={new Error('Prices could not be loaded — blank cells below do not mean a course has no fee.')} />}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Course</th><th>Type</th>
              {MODS.map((m) => (<th key={m} className="right">{lt(m)}</th>))}
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.course_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.course_name}</div>
                  <div className="fill-label">{c.category || '—'}</div>
                </td>
                <td><span className={`pill ${c.training_type === 'PersCert' ? 'pill-inside' : 'pill-webshop'}`}>{c.training_type}</span></td>
                {MODS.map((m) => (
                  <td key={m} className="right">
                    <input type="number" min="0" value={cellValue(c.course_id, m)}
                      aria-label={`${c.course_name} — ${lt(m)} fee`}
                      onChange={(e) => setCell(c.course_id, m, e.target.value)}
                      placeholder="—" style={{ maxWidth: 100, textAlign: 'right' }} />
                  </td>
                ))}
                <td className="right">
                  <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm" disabled={!dirty(c.course_id) || busy === c.course_id}
                      onClick={() => saveRow(c.course_id)}>
                      {busy === c.course_id ? 'Saving…' : 'Save'}
                    </button>
                    <Link className="linkbtn" href={`/course/${c.course_id}/edit`}>Edit</Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No courses match.</div>}
      </div>
    </>
  )
}
