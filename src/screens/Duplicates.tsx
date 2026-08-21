'use client'

import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useDuplicates, useMergeOrders } from '../hooks/data'
import { ErrorNote, Empty } from '../components/ui'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { TableSkeleton } from '../components/Skeleton'

export default function Duplicates() {
  const dups = useDuplicates()
  const merge = useMergeOrders()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [msg, setMsg] = useState(null)

  // Real reconciliation: cancel the DUPLICATE order + its lines (via
  // fn_merge_orders) so its seats and revenue stop being double-counted, keeping
  // the other order as the surviving booking. Ops/super_admin only — a sales user
  // hits the RLS wall and we surface that error. The mutation invalidates the
  // 'duplicates' and 'orders' keys, so the resolved row drops out of the queue.
  const doMerge = async (keep, dup) => {
    setMsg(null)
    const res = await confirm({
      title: 'Reconcile this duplicate pair?',
      body: `Order ${dup} and all of its lines will be CANCELLED — freeing its seats and revenue — and order ${keep} will be kept as the surviving booking. This fixes the double-count and cannot be undone here.`,
      confirmLabel: 'Merge & cancel duplicate',
      tone: 'danger',
      reason: 'required',
      reasonLabel: 'Reason (required)',
    })
    if (!res.ok) return
    try {
      const survivor = await merge.mutateAsync({ keep, dup, reason: res.reason })
      toast.success(`Merged into order ${survivor}. Duplicate ${dup} cancelled.`)
    } catch (err: any) {
      const m = err?.message || 'Merge failed.'
      setMsg(m)
      toast.error(m)
    }
  }

  // "Not a duplicate" is a triage flag only — it records the reviewer's decision
  // on the candidate and does not touch either order.
  const dismiss = async (id) => {
    setMsg(null)
    const { error } = await supabase
      .from('duplicate_candidate')
      .update({ status: 'Dismissed', resolved_date: new Date().toISOString().slice(0, 10) })
      .eq('candidate_id', id)
    if (error) { setMsg(error.message); toast.error(error.message); return }
    qc.invalidateQueries({ queryKey: ['duplicates'] })
    toast.success('Marked Dismissed.')
  }

  if (dups.isLoading) return <TableSkeleton rows={8} cols={4} />
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
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={merge.isPending}
                        onClick={() => doMerge(d.order_id_a, d.order_id_b)}
                      >
                        Keep {d.order_id_a} · cancel {d.order_id_b}
                      </button>
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={merge.isPending}
                        onClick={() => doMerge(d.order_id_b, d.order_id_a)}
                      >
                        Keep {d.order_id_b} · cancel {d.order_id_a}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={merge.isPending}
                        onClick={() => dismiss(d.candidate_id)}
                      >
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
