'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTrainerCourses, useTrainerAvailability, useCourses, useInvalidate } from '../hooks/data'
import { useToast } from './Toast'
import { useConfirm } from './Confirm'
import { shortDate } from '../lib/format'

// Operations manages a trainer's competencies (which courses they teach) and
// their blackout dates. Blackouts block assigning the trainer to overlapping
// sessions through a database guard.
export default function TrainerManage({ trainer, onClose }: { trainer: any; onClose: () => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidate()
  const competencies = useTrainerCourses(trainer.trainer_id)
  const availability = useTrainerAvailability(trainer.trainer_id)
  const courses = useCourses()
  const [bl, setBl] = useState({ start_date: '', end_date: '', reason: '' })
  const [busy, setBusy] = useState(false)

  const taught = new Set((competencies.data || []).map((c: any) => c.course_id))

  const toggleCourse = async (courseId: string, on: boolean) => {
    if (on) {
      const { error } = await supabase.from('trainer_course').insert({ trainer_id: trainer.trainer_id, course_id: courseId })
      if (error) toast.error(error.message)
    } else {
      const { error } = await supabase.from('trainer_course').delete().eq('trainer_id', trainer.trainer_id).eq('course_id', courseId)
      if (error) toast.error(error.message)
    }
    invalidate(['trainer_courses', 'trainer_course_map'])
  }

  const addBlackout = async () => {
    if (!bl.start_date) { toast.error('Set a start date.'); return }
    setBusy(true)
    const { error } = await supabase.from('trainer_availability').insert({
      trainer_id: trainer.trainer_id, start_date: bl.start_date, end_date: bl.end_date || bl.start_date, reason: bl.reason.trim() || null,
    })
    if (error) toast.error(error.message)
    else { setBl({ start_date: '', end_date: '', reason: '' }); invalidate(['trainer_availability']); toast.success('Blackout added.') }
    setBusy(false)
  }

  const removeBlackout = async (id: string) => {
    const res = await confirm({ title: 'Remove this blackout?', confirmLabel: 'Remove', tone: 'danger' })
    if (!res.ok) return
    const { error } = await supabase.from('trainer_availability').delete().eq('avail_id', id)
    if (error) toast.error(error.message); else invalidate(['trainer_availability'])
  }

  return (
    <div className="cmdk-scrim" onClick={onClose}>
      <div className="card card-pad" role="dialog" aria-modal="true" aria-label={`Manage ${trainer.name}`}
        style={{ maxWidth: 640, width: '100%', margin: '6vh auto', maxHeight: '86vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
        <div className="page-head" style={{ marginBottom: 8 }}>
          <div><h2 style={{ fontSize: 17 }}>{trainer.name}</h2><p>Competencies and availability</p></div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
        </div>

        <div className="k-label" style={{ margin: '8px 0' }}>Courses this trainer can teach</div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 4 }}>
          {(courses.data || []).map((c: any) => (
            <label key={c.course_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={taught.has(c.course_id)} onChange={(e) => toggleCourse(c.course_id, e.target.checked)} />
              {c.course_name}
            </label>
          ))}
        </div>

        <div className="k-label" style={{ margin: '16px 0 8px' }}>Blackout dates</div>
        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr auto', alignItems: 'end', gap: 8 }}>
          <label className="field"><span>From</span><input type="date" value={bl.start_date} onChange={(e) => setBl({ ...bl, start_date: e.target.value })} /></label>
          <label className="field"><span>To</span><input type="date" value={bl.end_date} onChange={(e) => setBl({ ...bl, end_date: e.target.value })} /></label>
          <label className="field"><span>Reason</span><input value={bl.reason} onChange={(e) => setBl({ ...bl, reason: e.target.value })} /></label>
          <button className="btn btn-sm" onClick={addBlackout} disabled={busy}>Add</button>
        </div>
        {(availability.data?.length || 0) > 0 && (
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>From</th><th>To</th><th>Reason</th><th></th></tr></thead>
            <tbody>
              {availability.data.map((a: any) => (
                <tr key={a.avail_id}>
                  <td className="fill-label">{shortDate(a.start_date)}</td>
                  <td className="fill-label">{shortDate(a.end_date)}</td>
                  <td className="fill-label">{a.reason || '—'}</td>
                  <td className="right"><button className="linkbtn" onClick={() => removeBlackout(a.avail_id)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
