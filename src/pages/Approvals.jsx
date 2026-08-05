import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useApprovals } from '../hooks/data'
import { Spinner, ErrorNote, Empty } from '../components/ui'
import { shortDate } from '../lib/format'

export default function Approvals() {
  const { profile } = useAuth()
  const approvals = useApprovals()
  const qc = useQueryClient()
  const [msg, setMsg] = useState(null)
  const canDecide = ['business_owner', 'super_admin'].includes(profile?.role)

  const decide = async (id, decision) => {
    setMsg(null)
    const { error } = await supabase
      .from('approval')
      .update({ decision, decided_by: profile.user_id, decision_date: new Date().toISOString().slice(0, 10) })
      .eq('approval_id', id)
    if (error) { setMsg(error.message); return }
    qc.invalidateQueries({ queryKey: ['approvals'] })
  }

  if (approvals.isLoading) return <Spinner label="Loading approvals" />
  if (approvals.error) return <ErrorNote error={approvals.error} />

  const pending = approvals.data.filter((a) => a.decision === 'Pending')
  const decided = approvals.data.filter((a) => a.decision !== 'Pending')

  const Row = ({ a, showActions }) => (
    <tr key={a.approval_id}>
      <td>{a.object_type}</td>
      <td>
        {a.object_type === 'Schedule cancellation'
          ? `${a.schedule?.course?.course_name || 'Session'} · ${shortDate(a.schedule?.start_date)}`
          : a.quarter}
      </td>
      <td>{a.note || '—'}</td>
      <td>
        <span className={`pill ${a.decision === 'Approved' ? 'pill-go' : a.decision === 'Rejected' ? 'pill-nogo' : 'pill-tentative'}`}>
          {a.decision}
        </span>
      </td>
      {showActions && (
        <td className="right">
          {canDecide ? (
            <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
              <button className="btn btn-sm" onClick={() => decide(a.approval_id, 'Approved')}>Approve</button>
              <button className="btn btn-danger btn-sm" onClick={() => decide(a.approval_id, 'Rejected')}>Reject</button>
            </div>
          ) : (
            <span className="muted fill-label">Awaiting business owner</span>
          )}
        </td>
      )}
    </tr>
  )

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Approvals</h1>
          <p>Forecast sign-off each quarter and every session cancellation. The business owner decides.</p>
        </div>
      </div>

      {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

      <h3 style={{ marginBottom: 8 }}>Pending</h3>
      {pending.length === 0 ? (
        <Empty title="Nothing pending">Cancellation proposals and forecast sign-offs land here for a decision.</Empty>
      ) : (
        <div className="card" style={{ marginBottom: 24 }}>
          <table>
            <thead>
              <tr><th>Type</th><th>Object</th><th>Note</th><th>Decision</th><th className="right">Action</th></tr>
            </thead>
            <tbody>{pending.map((a) => <Row key={a.approval_id} a={a} showActions />)}</tbody>
          </table>
        </div>
      )}

      {decided.length > 0 && (
        <>
          <h3 style={{ marginBottom: 8 }}>History</h3>
          <div className="card">
            <table>
              <thead>
                <tr><th>Type</th><th>Object</th><th>Note</th><th>Decision</th></tr>
              </thead>
              <tbody>{decided.map((a) => <Row key={a.approval_id} a={a} showActions={false} />)}</tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
