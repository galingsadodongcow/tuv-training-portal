'use client'
import { ReactNode, useMemo } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'
import {
  useMyTasks,
  useApprovals,
  useFulfillmentQueue,
  useSessionHealth,
  useOpenSchedules,
  useSlaBreaches,
  useInvalidate,
} from '../hooks/data'
import { Spinner, ErrorNote, Empty } from '../components/ui'
import { shortDate, php } from '../lib/format'
import {
  primaryFlag,
  isStalled,
  isUnowned,
  isOverdue,
  isPaidUnendorsed,
  isNoFeedback,
} from '../lib/orderState'
import { healthMeta, healthNeedsAction, Health } from '../lib/health'

// Days since a timestamp, floored. Used for item age. (mirrors Home)
const ageDays = (iso?: string) => (iso ? Math.floor((Date.now() - +new Date(iso)) / 86400000) : null)
const isTaskOverdue = (due?: string) => !!due && new Date(due) < new Date(new Date().toDateString())

const PRIORITY_CLASS: Record<string, string> = {
  urgent: 'pill-nogo',
  high: 'pill-tentative',
  normal: 'pill-webshop',
  low: 'pill-cancelled',
}

// Order flags → a colour, matching Worklist's inline treatment.
const toneColor = (tone?: string) =>
  tone === 'danger' ? 'var(--tr-red)' : tone === 'warn' ? 'var(--tr-amber)' : 'inherit'
// Severity order for sorting the orders stream (danger first).
const TONE_ORDER: Record<string, number> = { danger: 0, warn: 1, info: 2, ok: 3, neutral: 4 }

// An order is "on my plate" when any actionable order-state predicate fires.
const orderNeedsAttention = (o: any) =>
  isStalled(o) || isUnowned(o) || isOverdue(o) || isPaidUnendorsed(o) || isNoFeedback(o)

// Best-effort drill-through from a task entity to a screen. (mirrors Home)
function entityHref(entityType?: string, entityId?: string): string | null {
  if (!entityType) return null
  if (entityType === 'order') return entityId ? `/orders/${encodeURIComponent(entityId)}` : '/orders'
  if (entityType === 'order_line') return entityId ? `/orders?q=${encodeURIComponent(entityId)}` : '/orders'
  if (entityType === 'schedule') return entityId ? `/session/${encodeURIComponent(entityId)}` : '/calendar?month=all'
  if (entityType === 'client') return entityId ? `/clients/${encodeURIComponent(entityId)}` : '/clients'
  if (entityType === 'organization') return '/clients'
  if (entityType === 'course') return '/calendar?month=all'
  if (entityType === 'approval') return '/approvals'
  return null
}

// One section frame that resolves loading / error / empty the same way everywhere,
// using the shared ui primitives. Renders children (a table) only when there's data.
function Section({
  title,
  count,
  isLoading,
  error,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string
  count?: number
  isLoading?: boolean
  error?: any
  isEmpty?: boolean
  emptyLabel: string
  children?: ReactNode
}) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="k-label" style={{ marginBottom: 8 }}>
        {title}
        {typeof count === 'number' ? ` (${count})` : ''}
      </div>
      {error ? (
        <ErrorNote error={error} />
      ) : isLoading ? (
        <div className="card">
          <Spinner />
        </div>
      ) : isEmpty ? (
        <div className="card">
          <Empty title={emptyLabel} />
        </div>
      ) : (
        <div className="card">{children}</div>
      )}
    </div>
  )
}

export default function MyWork() {
  const { profile } = useAuth()
  const toast = useToast()
  const invalidate = useInvalidate()
  const role = profile?.role
  const userId = profile?.user_id
  const myCode = profile?.salesperson?.code
  // A plain selling rep sees their own orders; supervisors and non-sellers
  // (ops/BO/super_admin) see everyone's — same rule as the Worklist default.
  const selfScoped = !!myCode && !profile?.salesperson?.is_supervisor
  const canDecide = role === 'business_owner' || role === 'super_admin'

  const tasks = useMyTasks(userId)
  const approvals = useApprovals()
  const queue = useFulfillmentQueue()
  const health = useSessionHealth()
  const schedules = useOpenSchedules()
  const sla = useSlaBreaches()

  const pending = useMemo(
    () => (approvals.data || []).filter((a: any) => a.decision === 'Pending'),
    [approvals.data]
  )

  // Orders needing attention, kept to the current user's scope where the data
  // supports it, ordered most severe first.
  const attentionOrders = useMemo(() => {
    const rows = (queue.data || [])
      .filter((o: any) => !selfScoped || o.owner_code === myCode)
      .filter(orderNeedsAttention)
    return rows.sort(
      (a: any, b: any) =>
        (TONE_ORDER[primaryFlag(a)?.tone ?? 'neutral'] - TONE_ORDER[primaryFlag(b)?.tone ?? 'neutral']) ||
        (b.days_in_stage ?? 0) - (a.days_in_stage ?? 0)
    )
  }, [queue.data, selfScoped, myCode])

  // Sessions whose computed health needs an operator: join health → open
  // schedule, keep the actionable ones, sort by urgency then start date.
  const sessionRows = useMemo(() => {
    const healthMap = new Map<string, Health>()
    for (const r of health.data || []) healthMap.set(r.schedule_id, r.health)
    return (schedules.data || [])
      .map((s: any) => ({ ...s, health: healthMap.get(s.schedule_id) }))
      .filter((s: any) => healthNeedsAction(s.health))
      .sort(
        (a: any, b: any) =>
          healthMeta(b.health).weight - healthMeta(a.health).weight ||
          +new Date(a.start_date) - +new Date(b.start_date)
      )
  }, [health.data, schedules.data])

  const slaRows = sla.data || []

  const completeTask = async (taskId: string) => {
    const { error } = await supabase
      .from('task')
      .update({ status: 'done', completed_at: new Date().toISOString(), completed_by: userId })
      .eq('task_id', taskId)
    if (error) toast.error(error.message)
    else {
      toast.success('Task marked done.')
      invalidate(['my_tasks'])
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Work</h1>
          <p>Everything waiting on you — tasks, orders, sessions and exceptions in one place.</p>
        </div>
      </div>

      {/* 1. Tasks assigned to me — someone must act. */}
      <Section
        title="Tasks assigned to me"
        count={tasks.data?.length}
        isLoading={tasks.isLoading}
        error={tasks.error}
        isEmpty={(tasks.data?.length || 0) === 0}
        emptyLabel="No tasks assigned to you."
      >
        <table>
          <tbody>
            {(tasks.data || []).map((t: any) => {
              const href = entityHref(t.entity_type, t.entity_id)
              return (
                <tr key={t.task_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{t.title}</div>
                    <div className="fill-label">
                      {t.reason || t.detail || t.entity_type || '—'}
                      {href && (
                        <>
                          {' '}
                          · <Link href={href}>open record</Link>
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${PRIORITY_CLASS[t.priority] || 'pill-webshop'}`}>{t.priority}</span>
                  </td>
                  <td className="fill-label">
                    {t.due_date ? (
                      isTaskOverdue(t.due_date) ? (
                        <span style={{ color: 'var(--tr-red)', fontWeight: 600 }}>Overdue {shortDate(t.due_date)}</span>
                      ) : (
                        `Due ${shortDate(t.due_date)}`
                      )
                    ) : (
                      `${ageDays(t.created_at)}d old`
                    )}
                  </td>
                  <td className="right">
                    <button className="btn btn-ghost btn-sm" onClick={() => completeTask(t.task_id)}>
                      Mark done
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>

      {/* 2. Approvals to decide — only for the roles that can decide. */}
      {canDecide && (
        <Section
          title="Approvals to decide"
          count={pending.length}
          isLoading={approvals.isLoading}
          error={approvals.error}
          isEmpty={pending.length === 0}
          emptyLabel="No pending approvals."
        >
          <table>
            <tbody>
              {pending.map((a: any) => (
                <tr key={a.approval_id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{a.object_type}</div>
                    <div className="fill-label">
                      {a.schedule?.course?.course_name
                        ? `${a.schedule.course.course_name} · ${shortDate(a.schedule.start_date)}`
                        : a.quarter || a.note || '—'}
                    </div>
                  </td>
                  <td className="fill-label">{ageDays(a.created_at)}d waiting</td>
                  <td className="right">
                    <Link href="/approvals">Decide ›</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {/* 3. Orders needing my attention — stalled / unowned / overdue / paid-unendorsed. */}
      <Section
        title={selfScoped ? 'My orders needing attention' : 'Orders needing attention'}
        count={attentionOrders.length}
        isLoading={queue.isLoading}
        error={queue.error}
        isEmpty={attentionOrders.length === 0}
        emptyLabel="No orders need your attention."
      >
        <table>
          <tbody>
            {attentionOrders.slice(0, 50).map((o: any) => {
              const flag = primaryFlag(o)
              return (
                <tr key={o.order_id} className={o.days_in_stage > 14 ? 'risk-amber' : ''}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                    <Link href={`/orders/${o.order_id}`}>{o.order_id}</Link>
                    <div className="fill-label">
                      {o.company || o.contact || '—'} · {shortDate(o.order_date)}
                    </div>
                  </td>
                  <td>
                    <span className="pill pill-webshop">{o.fulfillment_stage}</span>
                    {flag && (
                      <div className="fill-label" style={{ marginTop: 4, color: toneColor(flag.tone) }}>
                        {flag.label}
                      </div>
                    )}
                  </td>
                  <td className="right fill-label">
                    {o.owner || (selfScoped ? 'You' : 'Unassigned')}
                    <div style={{ color: o.days_in_stage > 14 ? 'var(--tr-amber)' : 'inherit' }}>
                      {o.days_in_stage}d in stage
                    </div>
                  </td>
                  <td className="right">{php(o.total_amount)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Section>

      {/* 4. Sessions needing attention — computed health of open sessions. */}
      <Section
        title="Sessions needing attention"
        count={sessionRows.length}
        isLoading={health.isLoading || schedules.isLoading}
        error={health.error || schedules.error}
        isEmpty={sessionRows.length === 0}
        emptyLabel="No sessions need attention."
      >
        <table>
          <tbody>
            {sessionRows.slice(0, 50).map((s: any) => (
              <tr key={s.schedule_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    <Link href={`/session/${s.schedule_id}`}>{s.course?.course_name || 'Session'}</Link>
                  </div>
                  <div className="fill-label">
                    {shortDate(s.start_date)}
                    {s.modality ? ` · ${s.modality}` : ''}
                  </div>
                </td>
                <td className="right">
                  <span className={'pill ' + healthMeta(s.health).cls}>{healthMeta(s.health).label}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 5. Exceptions / SLA breaches — orders past the stage SLA. */}
      <Section
        title="Exceptions / SLA breaches"
        count={slaRows.length}
        isLoading={sla.isLoading}
        error={sla.error}
        isEmpty={slaRows.length === 0}
        emptyLabel="No SLA breaches."
      >
        <table>
          <tbody>
            {slaRows.map((b: any) => (
              <tr key={b.order_id} className="risk-amber">
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <Link href={`/orders/${b.order_id}`}>{b.order_id}</Link>
                  <div className="fill-label">
                    {b.company || '—'}
                    {b.owner ? ` · ${b.owner}` : ''}
                  </div>
                </td>
                <td>
                  <span className="pill pill-webshop">{b.fulfillment_stage}</span>
                </td>
                <td className="right fill-label">
                  <span style={{ color: 'var(--tr-red)', fontWeight: 600 }}>{b.days_over}d over</span>
                  <div>
                    {b.days_in_stage}d / {b.max_days}d target
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  )
}
