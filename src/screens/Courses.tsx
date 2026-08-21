'use client'
import { useMemo, useState, useEffect, useRef } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useCourses, useCourseFees } from '../hooks/data'
import { ErrorNote } from '../components/ui'
import { TableSkeleton } from '../components/Skeleton'
import { php } from '../lib/format'
import { lt } from '../lib/labels'
import CourseForm from './CourseForm'

const MODS = ['Live Online Training', 'Face-to-face', 'E-learning']

// Training catalogue: every course with its fee per learning type (read-only in
// the directory). Creating and editing — including the fees — happen in one
// right-side edit-drawer that hosts the course form, so there is a single
// fee-editing path (#13, was: inline grid here + the form). Deep-linkable via
// ?new / ?edit=<id>; the old /course/new and /course/[id]/edit routes redirect
// in.
//
// `readOnly` renders the same directory as a pure catalogue lookup for the
// sales/oversight roles (the /training entry, #8): no "+ New course", no
// edit-drawer, non-interactive rows. Write access is the DB's call regardless —
// this only removes affordances the edit screen (super_admin/operations) keeps.
export default function Courses({ readOnly }: { readOnly?: boolean } = {}) {
  const courses = useCourses()
  const fees = useCourseFees()
  const search = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [q, setQ] = useState('')

  const editId = search.get('edit') || undefined
  const isNew = search.has('new')
  const drawerOpen = isNew || !!editId
  const openNew = () => router.replace(`${pathname}?new`, { scroll: false })
  const openEdit = (id: string) => router.replace(`${pathname}?edit=${id}`, { scroll: false })
  const closeDrawer = () => router.replace(pathname, { scroll: false })

  // feeMap[course_id][modality] = fee
  const feeMap = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    for (const f of fees.data || []) { (m[f.course_id] ||= {})[f.modality] = f.fee_php }
    return m
  }, [fees.data])

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = courses.data || []
    if (!t) return list
    return list.filter((c: any) =>
      c.course_name?.toLowerCase().includes(t) || c.category?.toLowerCase().includes(t))
  }, [courses.data, q])

  if (courses.isLoading || fees.isLoading) return <TableSkeleton rows={10} cols={6} />
  if (courses.error) return <ErrorNote error={courses.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Training catalogue</h1>
          <p>
            Every course and its fee per learning type, excl. VAT.{' '}
            {readOnly ? 'Sessions and dates are on the Calendar.' : 'Open a course to edit its details and prices.'}
          </p>
        </div>
        {!readOnly && (
          <div className="toolbar">
            <button className="btn" onClick={openNew}>+ New course</button>
          </div>
        )}
      </div>

      <div className="filters">
        <input placeholder="Search course or category…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
      </div>

      {fees.error && <ErrorNote error={new Error('Prices could not be loaded — a dash below does not mean a course has no fee.')} />}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Course</th><th>Type</th>
              {MODS.map((m) => (<th key={m} className="right">{lt(m)}</th>))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr key={c.course_id} {...(readOnly ? {} : {
                className: 'clickable', role: 'button', tabIndex: 0,
                'aria-label': `Edit ${c.course_name}`,
                onClick: () => openEdit(c.course_id),
                onKeyDown: (e: any) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEdit(c.course_id) } },
              })}>
                <td>
                  <div style={{ fontWeight: 600 }}>{c.course_name}</div>
                  <div className="fill-label">{c.category || '—'}</div>
                </td>
                <td><span className={`pill ${c.training_type === 'PersCert' ? 'pill-inside' : 'pill-webshop'}`}>{c.training_type}</span></td>
                {MODS.map((m) => (
                  <td key={m} className="right">{feeMap[c.course_id]?.[m] != null ? php(feeMap[c.course_id][m]) : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="empty">No courses match.</div>}
      </div>

      {!readOnly && drawerOpen && <CourseDrawer courseId={editId} onClose={closeDrawer} />}
    </>
  )
}

// Right-side drawer that hosts the course form for create/edit (the shared
// house drawer pattern: scrim → drawer, role=dialog, Escape / scrim to close).
function CourseDrawer({ courseId, onClose }: { courseId?: string; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div className="drawer-scrim" onClick={onClose}>
      <div
        className="drawer"
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={courseId ? 'Edit course' : 'New course'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
      >
        <div className="drawer-head">
          <div>
            <h3 style={{ margin: 0 }}>{courseId ? 'Edit course' : 'New course'}</h3>
            <p className="muted" style={{ margin: '2px 0 0' }}>A course holds many sessions and sells in one or more learning types, each with its own fee.</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="drawer-body">
          <CourseForm courseId={courseId} onDone={onClose} />
        </div>
      </div>
    </div>
  )
}
