'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useDuplicates } from '../hooks/data'
import { Spinner, ErrorNote, Empty } from '../components/ui'

export default function Duplicates() {
  const dups = useDuplicates()
  const qc = useQueryClient()
  const [msg, setMsg] = useState(null)

  // NOTE: this only records the reviewer's decision on the candidate. It does
  // NOT reconcile the two orders — cancelling/merging the duplicate order and
  // moving its lines must happen server-side (an RPC) so seats and revenue stop
  // being double-counted. Until that exists, "Merge" is a triage flag only.
  const resolve = async (id, status) => {
    setMsg(null)
    if (status === 'Merged' &&
        !window.confirm('Mark this pair as merged? This flags the candidate as resolved but does not yet cancel or combine the underlying orders.')) {
      return
    }
    const { error } = await supabase
      .from('duplicate_candidate')
      .update({ status, resolved_date: new Date().toISOString().slice(0, 10) })
      .eq('candidate_id', id)
    if (error) { setMsg(error.message); return }
    qc.invalidateQueries({ queryKey: ['duplicates'] })
  }

  if (dups.isLoading) return <Spinner label="Loading duplicate queue" />
  if (dups.error) return <ErrorNote error={dups.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Duplicate resolution</h1>
          <p>Candidates where a sales order and a webshop order look like the same booking.</p>
        </div>
      </div>

      {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

      {dups.data.length === 0 ? (
        <Empty title="No open duplicates">
          The queue fills when a sales-entered order shares an email or company and session with a webshop order.
        </Empty>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th>Sales order</th>
                <th>Webshop order</th>
                <th>Match basis</th>
                <th className="right">Action</th>
              </tr>
            </thead>
            <tbody>
              {dups.data.map((d) => (
                <tr key={d.candidate_id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{d.order_id_a}</td>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{d.order_id_b}</td>
                  <td>{d.match_basis}</td>
                  <td className="right">
                    <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => resolve(d.candidate_id, 'Merged')}>
                        Merge
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => resolve(d.candidate_id, 'Dismissed')}>
                        Not a duplicate
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
