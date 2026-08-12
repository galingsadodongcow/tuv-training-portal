'use client'
import { ReactNode, useMemo } from 'react'
import Link from 'next/link'
import {
  useDigest,
  useOpenSchedules,
  useSessionHealth,
  useApprovals,
} from '../hooks/data'
import { Spinner, ErrorNote, Empty } from '../components/ui'
import { shortDate, php } from '../lib/format'
import { healthMeta, Health } from '../lib/health'

// Local midnight, so "today" / "this week" compare on the calendar day only.
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
// Whole days from today to a date string (0 = today, 1..7 = this week).
const daysFromToday = (iso?: string) => {
  if (!iso) return null
  const then = startOfDay(new Date(iso))
  const now = startOfDay(new Date())
  return Math.round((+then - +now) / 86400000)
}

// One section frame that resolves loading / error / empty the same way
// everywhere, using the shared ui primitives. (mirrors My Work.)
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

// A single open-schedule row: course link, date, modality, and health pill.
function ScheduleRows({ rows, healthMap }: { rows: any[]; healthMap: Map<string, Health> }) {
  return (
    <table>
      <tbody>
        {rows.map((s: any) => {
          const meta = healthMeta(healthMap.get(s.schedule_id))
          return (
            <tr key={s.schedule_id}>
              <td>
                <div style={{ fontWeight: 600 }}>
                  <Link href={`/session/${s.schedule_id}`}>{s.course?.course_name || 'Session'}</Link>
                </div>
                <div className="fill-label">
                  {shortDate(s.start_date)}
                  {s.modality ? ` · ${s.modality}` : ''}
                  {s.status ? ` · ${s.status}` : ''}
                </div>
              </td>
              <td className="right">
                <span className={'pill ' + meta.cls}>{meta.label}</span>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

export default function OperationsToday() {
  const digest = useDigest()
  const schedules = useOpenSchedules()
  const health = useSessionHealth()
  const approvals = useApprovals()

  // Health signal keyed by schedule, so each session row shows a live pill.
  const healthMap = useMemo(() => {
    const m = new Map<string, Health>()
    for (const r of health.data || []) m.set(r.schedule_id, r.health)
    return m
  }, [health.data])

  // Open sessions split by start day: today, and the next 7 days.
  const bySchedule = (a: any, b: any) => +new Date(a.start_date) - +new Date(b.start_date)
  const todaySessions = useMemo(
    () => (schedules.data || []).filter((s: any) => daysFromToday(s.start_date) === 0).sort(bySchedule),
    [schedules.data]
  )
  const weekSessions = useMemo(
    () =>
      (schedules.data || [])
        .filter((s: any) => {
          const d = daysFromToday(s.start_date)
          return d != null && d >= 1 && d <= 7
        })
        .sort(bySchedule),
    [schedules.data]
  )

  const d = digest.data
  // At risk unifies below-min sessions and unstaffed (no-trainer) sessions.
  const atRisk = d?.atRisk || []
  const unstaffed = d?.unstaffed || []
  const atRiskCount = atRisk.length + unstaffed.length
  const rosterGaps = d?.rosterGaps || []
  const stalled = d?.stalled || []
  const elearning = d?.elearning || []

  const pending = useMemo(
    () => (approvals.data || []).filter((a: any) => a.decision === 'Pending'),
    [approvals.data]
  )

  const schedLoading = schedules.isLoading || health.isLoading
  const schedError = schedules.error || health.error

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Operations today</h1>
          <p>The operations cockpit — what runs today, what is at risk, and what is waiting on a decision.</p>
        </div>
      </div>

      {/* 1a. Sessions starting today. */}
      <Section
        title="Today"
        count={todaySessions.length}
        isLoading={schedLoading}
        error={schedError}
        isEmpty={todaySessions.length === 0}
        emptyLabel="No sessions start today."
      >
        <ScheduleRows rows={todaySessions} healthMap={healthMap} />
      </Section>

      {/* 1b. Sessions starting in the next 7 days. */}
      <Section
        title="This week"
        count={weekSessions.length}
        isLoading={schedLoading}
        error={schedError}
        isEmpty={weekSessions.length === 0}
        emptyLabel="No sessions start in the next 7 days."
      >
        <ScheduleRows rows={weekSessions} healthMap={healthMap} />
      </Section>

      {/* 2. At risk — below-minimum enrolment and sessions with no trainer. */}
      <Section
        title="At risk"
        count={atRiskCount}
        isLoading={digest.isLoading}
        error={digest.error}
        isEmpty={atRiskCount === 0}
        emptyLabel="No sessions at risk."
      >
        <table>
          <tbody>
            {atRisk.map((r: any) => (
              <tr key={`risk-${r.schedule_id}`}>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    <Link href={`/session/${r.schedule_id}`}>{r.course_name || 'Session'}</Link>
                  </div>
                  <div className="fill-label">
                    {shortDate(r.start_date)}
                    {r.modality ? ` · ${r.modality}` : ''}
                    {r.country ? ` · ${r.country}` : ''}
                  </div>
                </td>
                <td className="right fill-label">
                  <span style={{ color: 'var(--tr-amber)', fontWeight: 600 }}>
                    {r.booked_participants} / {r.min_participants} pax
                  </span>
                  <div>
                    {r.seats_needed} to Go · {r.days_out}d out
                  </div>
                </td>
              </tr>
            ))}
            {unstaffed.map((u: any) => (
              <tr key={`unstaffed-${u.schedule_id}`}>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    <Link href={`/session/${u.schedule_id}`}>{u.course_name || 'Session'}</Link>
                  </div>
                  <div className="fill-label">{shortDate(u.start_date)}</div>
                </td>
                <td className="right fill-label">
                  <span style={{ color: 'var(--tr-red)', fontWeight: 600 }}>No trainer</span>
                  <div>{u.days_out}d out</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 3. Roster gaps — sold seats without captured participant names. */}
      <Section
        title="Roster gaps"
        count={rosterGaps.length}
        isLoading={digest.isLoading}
        error={digest.error}
        isEmpty={rosterGaps.length === 0}
        emptyLabel="No roster gaps."
      >
        <table>
          <tbody>
            {rosterGaps.map((r: any) => (
              <tr key={r.schedule_id}>
                <td>
                  <div style={{ fontWeight: 600 }}>
                    <Link href={`/session/${r.schedule_id}`}>{r.course_name || 'Session'}</Link>
                  </div>
                  <div className="fill-label">{shortDate(r.start_date)}</div>
                </td>
                <td className="right fill-label">
                  <span style={{ color: 'var(--tr-amber)', fontWeight: 600 }}>
                    {r.missing} of {r.seats_sold} names missing
                  </span>
                  <div>{r.names_captured} captured</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 4. Stalled orders — sitting too long in a fulfillment stage. */}
      <Section
        title="Stalled orders"
        count={stalled.length}
        isLoading={digest.isLoading}
        error={digest.error}
        isEmpty={stalled.length === 0}
        emptyLabel="No stalled orders."
      >
        <table>
          <tbody>
            {stalled.map((o: any) => (
              <tr key={o.order_id}>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <Link href={`/orders/${o.order_id}`}>{o.order_id}</Link>
                  <div className="fill-label">
                    {o.company || '—'}
                    {o.owner ? ` · ${o.owner}` : ''}
                  </div>
                </td>
                <td>
                  <span className="pill pill-webshop">{o.fulfillment_stage}</span>
                  <div className="fill-label" style={{ marginTop: 4, color: 'var(--tr-amber)' }}>
                    {o.days_in_stage}d in stage
                  </div>
                </td>
                <td className="right">{php(o.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 5. E-learning waiting — enrolments awaiting provisioning. */}
      <Section
        title="E-learning waiting"
        count={elearning.length}
        isLoading={digest.isLoading}
        error={digest.error}
        isEmpty={elearning.length === 0}
        emptyLabel="No e-learning enrolments waiting."
      >
        <table>
          <tbody>
            {elearning.map((e: any) => (
              <tr key={e.line_id}>
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <Link href={`/orders/${e.order_id}`}>{e.order_id}</Link>
                  <div className="fill-label">
                    {e.company || '—'} · {e.course_name || '—'}
                  </div>
                </td>
                <td className="right fill-label">
                  <span style={{ color: 'var(--tr-amber)', fontWeight: 600 }}>{e.days_waiting}d waiting</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* 6. Decisions — pending approvals waiting on ops / owners. */}
      <Section
        title="Decisions"
        count={pending.length}
        isLoading={approvals.isLoading}
        error={approvals.error}
        isEmpty={pending.length === 0}
        emptyLabel="No pending decisions."
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
                <td className="right">
                  <Link href="/approvals">Decide ›</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </>
  )
}
