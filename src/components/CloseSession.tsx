'use client'

import { useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useCloseCheck, useInvalidate } from '../hooks/data'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { Spinner } from './ui'
import { useConfirm } from './Confirm'
import { php } from '../lib/format'

export default function CloseSession({ schedule, onDone, onClose }: { schedule: any; onDone: () => void; onClose: () => void }) {
  const check = useCloseCheck(schedule.schedule_id)
  const invalidate = useInvalidate()
  const confirm = useConfirm()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  useFocusTrap(dialogRef)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [result, setResult] = useState(null)

  const run = async (force) => {
    const res = await confirm({
      title: force ? 'Close session with unmarked attendance?' : 'Close this session?',
      body: force
        ? 'Attendance is still unmarked for some participants. Closing anyway records actuals counting only those marked Attended, marks orders Completed, and permanently locks the roster. This cannot be undone.'
        : 'Closing records actuals, marks the orders Completed, and permanently locks the roster so no further attendance or participant changes can be made. This cannot be undone.',
      confirmLabel: force ? 'Close anyway' : 'Close session',
      tone: 'danger',
    })
    if (!res.ok) return
    setBusy(true); setMsg(null)
    const { data, error } = await supabase.rpc('fn_close_session', {
      p_schedule: schedule.schedule_id,
      p_force: force,
    })
    if (error) { setMsg(error.message); setBusy(false); return }
    setResult(data?.[0] || null)
    invalidate(['schedules', 'orders', 'session_orders', 'roster', 'notes', 'close_check', 'channel_pax'])
    setBusy(false)
  }

  const c = check.data

  return (
    <div className="drawer-scrim" onClick={() => onClose()} style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div ref={dialogRef} className="card card-pad" role="dialog" aria-modal="true" aria-label="Close session"
        style={{ width: 500, maxWidth: '94vw' }} onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}>
        <h3 style={{ marginTop: 0 }}>Close session</h3>

        {result ? (
          <>
            <div className="notice notice-info">
              Closed. {result.attended} attended, {php(result.revenue)} recorded
              {result.unpaid > 0 && `, ${result.unpaid} order(s) moved to collection follow-up`}.
              {result.warning && ` ${result.warning}`}
            </div>
            <button className="btn" onClick={() => { onDone(); onClose() }}>Done</button>
          </>
        ) : check.isLoading ? (
          <Spinner />
        ) : (
          <>
            <p className="muted" style={{ fontSize: 14 }}>
              {schedule.course?.course_name}. Closing records actuals, marks orders Completed, and locks the roster.
            </p>
            <table style={{ marginBottom: 14 }}>
              <tbody>
                <tr><td>Seats sold</td><td className="right">{c?.seats_sold ?? 0}</td></tr>
                <tr><td>Names captured</td><td className="right">{c?.names_captured ?? 0}</td></tr>
                <tr><td>Attendance still unmarked</td>
                  <td className="right" style={{ color: c?.attendance_unmarked > 0 ? 'var(--tr-amber)' : 'inherit', fontWeight: 600 }}>
                    {c?.attendance_unmarked ?? 0}
                  </td></tr>
                <tr><td>Revenue to record</td><td className="right">{php(c?.revenue_booked ?? 0)}</td></tr>
                <tr><td>Unpaid orders</td>
                  <td className="right" style={{ color: c?.unpaid_orders > 0 ? 'var(--tr-amber)' : 'inherit' }}>
                    {c?.unpaid_orders ?? 0} · {php(c?.amount_uncollected ?? 0)}
                  </td></tr>
              </tbody>
            </table>

            {c?.attendance_unmarked > 0 && (
              <div className="notice notice-info" style={{ marginBottom: 12 }}>
                Mark attendance on the Participants tab first. Closing anyway counts only those marked Attended.
              </div>
            )}
            {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

            <div className="toolbar">
              <button className="btn" disabled={busy} onClick={() => run(false)}>
                {busy ? 'Closing…' : 'Close session'}
              </button>
              {c?.attendance_unmarked > 0 && (
                <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run(true)}>
                  Close anyway
                </button>
              )}
              <button className="btn btn-ghost" onClick={() => onClose()}>Cancel</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
