'use client'
import { ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import {
  useFulfillmentQueue,
  useUnstaffed,
  useSchedules,
  useDuplicates,
  useApprovals,
  useOpenExceptions,
  useMyTasks,
  useMyNotifications,
  useInvalidate,
} from '../hooks/data'
import { KpiSkeleton, TableSkeleton } from '../components/Skeleton'
import { shortDate } from '../lib/format'
import { lt } from '../lib/labels'

// Days since a timestamp, floored. Used for item age.
const ageDays = (iso?: string) => (iso ? Math.floor((Date.now() - +new Date(iso)) / 86400000) : null)
const isOverdue = (due?: string) => !!due && new Date(due) < new Date(new Date().toDateString())

const PRIORITY_CLASS: Record<string, string> = {
  urgent: 'pill-nogo',
  high: 'pill-tentative',
  normal: 'pill-webshop',
  low: 'pill-cancelled',
}

// Best-effort drill-through from a task/notification entity to a screen.
function entityHref(entityType?: string, entityId?: string): string | null {
  if (!entityType) return null
  if (entityType === 'order') return entityId ? `/orders/${encodeURIComponent(entityId)}` : '/orders'
  if (entityType === 'order_line') return entityId ? `/orders?q=${encodeURIComponent(entityId)}` : '/orders'
  if (entityType === 'schedule') return entityId ? `/session/${encodeURIComponent(entityId)}` : '/calendar?month=all'
  if (entityType === 'client') return entityId ? `/clients/${encodeURIComponent(entityId)}` : '/clients'
  if (entityType === 'organization') return '/clients'
  if (entityType === 'course') return '/calendar?month=all'
  if (entityType === 'import_exception') return '/sap-import'
  if (entityType === 'approval') return '/approvals'
  return null
}

interface CardDef {
  label: string
  value: number | string
  sub: string
  href: string
  alert?: boolean
}

function AttentionCard({ c }: { c: CardDef }) {
  const hot = c.alert && typeof c.value === 'number' && c.value > 0
  return (
    <Link href={c.href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card card-pad kpi">
        <div className="k-label">{c.label}</div>
        <div className="k-value" style={{ color: hot ? 'var(--tr-amber)' : undefined }}>{c.value}</div>
        <div className="k-sub">{c.sub} ›</div>
      </div>
    </Link>
  )
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="k-label" style={{ marginBottom: 8 }}>
        {title}{typeof count === 'number' ? ` (${count})` : ''}
      </div>
      {children}
    </div>
  )
}

export default function Home() {
  const { profile } = useAuth()
  const toast = useToast()
  const invalidate = useInvalidate()
  const role = profile?.role
  const userId = profile?.user_id
  const myCode = profile?.salesperson?.code
  const canDecide = role === 'business_owner' || role === 'super_admin'
  const isAdmin = role === 'super_admin'

  const queue = useFulfillmentQueue()
  const unstaffed = useUnstaffed()
  const sched = useSchedules()
  const dups = useDuplicates()
  const approvals = useApprovals()
  const exceptions = useOpenExceptions()
  const tasks = useMyTasks(userId)
  const notifs = useMyNotifications(userId)

  const q: any[] = queue.data || []
  const today = new Date(new Date().toDateString())
  const belowMin = (sched.data || []).filter(
    (r: any) => ['Tentative', 'Confirmed'].includes(r.status) && r.booked_participants < r.min_participants && new Date(r.start_date) >= today
  ).length
  const unassigned = q.filter((o) => !o.owner_code).length
  const mine = q.filter((o) => o.owner_code === myCode).length
  const myStalled = q.filter((o) => o.owner_code === myCode && o.days_in_stage > 14).length
  const awaitingEndorsement = q.filter((o) => ['For Order Creation', 'Endorsed to Ops'].includes(o.fulfillment_stage)).length
  const unstaffedNear = (unstaffed.data || []).filter((u: any) => u.days_out <= 21).length
  const pending = (approvals.data || []).filter((a: any) => a.decision === 'Pending')
  const pendingCancellations = pending.filter((a: any) => a.object_type === 'Schedule cancellation').length
  const dupCount = (dups.data || []).length
  const exCount = (exceptions.data || []).length

  const cardsByRole: Record<string, CardDef[]> = {
    operations: [
      { label: 'Sessions below minimum', value: belowMin, sub: 'Upcoming, still need pax', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Unstaffed sessions', value: unstaffedNear, sub: 'No trainer within 3 weeks', href: '/calendar?month=all', alert: true },
      { label: 'Awaiting endorsement', value: awaitingEndorsement, sub: 'Orders to move to ops', href: '/worklist?who=all&stage=Endorsed to Ops' },
      { label: 'Pending cancellations', value: pendingCancellations, sub: 'Decisions on the approvals screen', href: '/approvals' },
    ],
    sales: [
      { label: 'Unassigned orders', value: unassigned, sub: 'Claim these', href: '/worklist?who=unassigned', alert: true },
      { label: 'My open orders', value: mine, sub: 'Assigned to me', href: '/worklist?who=mine' },
      { label: 'My stalled orders', value: myStalled, sub: 'Over 14 days in stage', href: '/worklist?who=mine&view=stalled', alert: true },
      { label: 'Sessions needing pax', value: belowMin, sub: 'Below minimum, sell seats', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
    ],
    business_owner: [
      { label: 'Sessions below minimum', value: belowMin, sub: 'Risk of a no-go', href: '/calendar?month=all&sort=fill&dir=asc', alert: true },
      { label: 'Pending approvals', value: pending.length, sub: 'Awaiting your decision', href: '/approvals', alert: true },
      { label: 'Unassigned orders', value: unassigned, sub: 'No owner yet', href: '/worklist?who=unassigned' },
      { label: 'Performance', value: 'View', sub: 'Revenue against forecast', href: '/dashboard' },
    ],
    super_admin: [
      { label: 'Import exceptions', value: exCount, sub: 'Unresolved rows', href: '/sap-import', alert: true },
      { label: 'Duplicate candidates', value: dupCount, sub: 'Review and merge', href: '/duplicates', alert: true },
      { label: 'Orders missing an owner', value: unassigned, sub: 'Assign a salesperson', href: '/worklist?who=unassigned', alert: true },
      { label: 'Pending approvals', value: pending.length, sub: 'Across the team', href: '/approvals' },
    ],
  }
  const cards = cardsByRole[role || ''] || cardsByRole.operations

  const cardsLoading = queue.isLoading || sched.isLoading || approvals.isLoading

  const completeTask = async (taskId: string) => {
    const { error } = await supabase.from('task').update({ status: 'done', completed_at: new Date().toISOString(), completed_by: userId }).eq('task_id', taskId)
    if (error) toast.error(error.message)
    else { toast.success('Task marked done.'); invalidate(['my_tasks']) }
  }

  const markRead = async (notifId: number) => {
    const { error } = await supabase.from('notification').update({ is_read: true, read_at: new Date().toISOString() }).eq('notif_id', notifId)
    if (error) toast.error(error.message)
    else invalidate(['my_notifications'])
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Good day{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}</h1>
          <p>What needs your attention, and what to do next.</p>
        </div>
      </div>

      <Section title="Needs your attention">
        {cardsLoading ? (
          <KpiSkeleton count={4} />
        ) : (
          <div className="grid kpis" style={{ marginBottom: 0 }}>
            {cards.map((c) => (<AttentionCard key={c.label} c={c} />))}
          </div>
        )}
      </Section>

      <div className="page-head" style={{ marginBottom: 12 }}>
        <div><h1 style={{ fontSize: 18 }}>My Work</h1></div>
      </div>

      {/* Stream 1: Tasks. Someone must act. */}
      <Section title="Tasks assigned to me" count={tasks.data?.length}>
        {tasks.isLoading ? (
          <TableSkeleton rows={3} cols={3} />
        ) : (tasks.data?.length || 0) === 0 ? (
          <div className="card"><div className="empty">No tasks assigned to you.</div></div>
        ) : (
          <div className="card">
            <table>
              <tbody>
                {tasks.data.map((t: any) => {
                  const href = entityHref(t.entity_type, t.entity_id)
                  return (
                    <tr key={t.task_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        <div className="fill-label">
                          {t.reason || t.detail || t.entity_type || '—'}
                          {href && <> · <Link href={href}>open record</Link></>}
                        </div>
                      </td>
                      <td>
                        <span className={`pill ${PRIORITY_CLASS[t.priority] || 'pill-webshop'}`}>{t.priority}</span>
                      </td>
                      <td className="fill-label">
                        {t.due_date
                          ? (isOverdue(t.due_date) ? <span style={{ color: 'var(--tr-red)', fontWeight: 600 }}>Overdue {shortDate(t.due_date)}</span> : `Due ${shortDate(t.due_date)}`)
                          : `${ageDays(t.created_at)}d old`}
                      </td>
                      <td className="right">
                        <button className="btn btn-ghost btn-sm" onClick={() => completeTask(t.task_id)}>Mark done</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Stream 2: Notifications. Something happened. */}
      <Section title="Unread notifications" count={notifs.data?.length}>
        {notifs.isLoading ? (
          <TableSkeleton rows={2} cols={2} />
        ) : (notifs.data?.length || 0) === 0 ? (
          <div className="card"><div className="empty">No unread notifications.</div></div>
        ) : (
          <div className="card">
            <table>
              <tbody>
                {notifs.data.map((n: any) => {
                  const href = entityHref(n.entity_type, n.entity_id)
                  return (
                    <tr key={n.notif_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{n.title}</div>
                        <div className="fill-label">
                          {n.body || n.kind}
                          {href && <> · <Link href={href}>open record</Link></>}
                        </div>
                      </td>
                      <td className="fill-label">{ageDays(n.created_at)}d ago</td>
                      <td className="right">
                        <button className="btn btn-ghost btn-sm" onClick={() => markRead(n.notif_id)}>Mark read</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      {/* Stream 3: Approvals. A named person must decide. */}
      {canDecide && (
        <Section title="Pending approvals" count={pending.length}>
          {approvals.isLoading ? (
            <TableSkeleton rows={2} cols={2} />
          ) : pending.length === 0 ? (
            <div className="card"><div className="empty">No pending approvals.</div></div>
          ) : (
            <div className="card">
              <table>
                <tbody>
                  {pending.map((a: any) => (
                    <tr key={a.approval_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{a.object_type}</div>
                        <div className="fill-label">
                          {a.schedule?.course?.course_name ? `${a.schedule.course.course_name} · ${shortDate(a.schedule.start_date)}` : a.quarter || a.note || '—'}
                        </div>
                      </td>
                      <td className="fill-label">{ageDays(a.created_at)}d waiting</td>
                      <td className="right"><Link href="/approvals">Decide ›</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {/* Stream 4: Exceptions. The system found a problem. */}
      {isAdmin && (
        <Section title="Open import exceptions" count={exCount}>
          {exceptions.isLoading ? (
            <TableSkeleton rows={2} cols={2} />
          ) : exCount === 0 ? (
            <div className="card"><div className="empty">No open import exceptions.</div></div>
          ) : (
            <div className="card">
              <table>
                <tbody>
                  {exceptions.data.map((e: any) => (
                    <tr key={e.exception_id}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{e.reason || 'Import problem'}</div>
                        <div className="fill-label">{e.source || 'import'}</div>
                      </td>
                      <td className="fill-label">{ageDays(e.created_at)}d ago</td>
                      <td className="right"><Link href="/sap-import">Resolve ›</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
    </>
  )
}
