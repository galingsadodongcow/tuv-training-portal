'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useSalespeople, useInvalidate } from '../hooks/data'
import { useConfirm } from './Confirm'
import { useToast } from './Toast'

// One implementation of "who owns this order", shared by the fulfilment queue
// and the order record. Order details showed "no owner assigned" with no way to
// fix it while the queue had a working picker (owner feedback) — the logic lived
// inline in Worklist, so this lifts it out rather than growing a second copy.
//
// Authority mirrors the order_assignment policies: super_admin (p_asg_admin),
// operations (p_asg_ops), business_owner + supervisors (p_asg_lead_*) and the
// coordinator (p_asg_coord) may set any owner; a sales rep may only take an
// unowned order for themselves (p_asg_sales_i). RLS is authoritative — this only
// decides which control to show.
export function canAssignAnyOwner(profile: any): boolean {
  return (
    ['super_admin', 'operations', 'business_owner', 'coordinator'].includes(profile?.role as string) ||
    !!profile?.salesperson?.is_supervisor
  )
}

export default function OwnerAssign({
  orderId, ownerSalesId, ownerName, invalidateKeys = ['fulfillment_queue', 'orders', 'order'], compact,
}: {
  orderId: string
  ownerSalesId?: string | null
  ownerName?: string | null
  invalidateKeys?: string[]
  /** Queue rows want a bare control; the record header wants a labelled one. */
  compact?: boolean
}) {
  const { profile } = useAuth()
  const people = useSalespeople()
  const invalidate = useInvalidate()
  const confirm = useConfirm()
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  const canAny = canAssignAnyOwner(profile)

  const done = (msg: string) => { invalidate(invalidateKeys); toast.success(msg) }

  const selfAssign = async () => {
    setBusy(true)
    // upsert keyed on order_id: one assignment per order, no check-then-act race.
    const { error } = await supabase.from('order_assignment')
      .upsert({ order_id: orderId, sales_id: profile?.sales_id }, { onConflict: 'order_id' })
    setBusy(false)
    if (error) toast.error(error.message)
    else done('Order assigned to you.')
  }

  const reassign = async (salesId: string) => {
    // Reassignment moves ownership away from someone: confirm and take a reason.
    const who = salesId
      ? (people.data?.find((p: any) => p.sales_id === salesId)?.name || 'another owner')
      : 'no one'
    const res = await confirm({
      title: salesId ? 'Reassign this order?' : 'Unassign this order?',
      body: `Ownership changes to ${who}.`,
      confirmLabel: salesId ? 'Reassign' : 'Unassign',
      tone: salesId ? 'default' : 'danger',
      reason: 'optional',
    })
    if (!res.ok) return
    setBusy(true)
    // Empty selection means unassign: delete the row rather than writing an empty FK.
    const { error } = salesId
      ? await supabase.from('order_assignment').upsert({ order_id: orderId, sales_id: salesId }, { onConflict: 'order_id' })
      : await supabase.from('order_assignment').delete().eq('order_id', orderId)
    setBusy(false)
    if (error) toast.error(error.message)
    else done('Assignment updated.')
  }

  if (canAny) {
    const select = (
      <select
        aria-label={`Owner for order ${orderId}`}
        value={ownerSalesId || ''}
        disabled={busy || people.isLoading}
        onChange={(e) => reassign(e.target.value)}
        style={{ minWidth: 140 }}
      >
        <option value="">Unassigned</option>
        {people.data?.map((p: any) => (<option key={p.sales_id} value={p.sales_id}>{p.name}</option>))}
      </select>
    )
    if (compact) return select
    return (
      <label className="owner-assign">
        <span className="fill-label">Owner</span>
        {select}
      </label>
    )
  }

  // Not an assigner. A sales rep can still claim an unowned order for themselves.
  if (ownerName) return <span className="fill-label">{ownerName}</span>
  if (profile?.sales_id) {
    return (
      <button className="btn btn-sm" disabled={busy} onClick={selfAssign}>
        {compact ? 'Pick up' : 'Assign to me'}
      </button>
    )
  }
  return <span className="fill-label">Unassigned</span>
}
