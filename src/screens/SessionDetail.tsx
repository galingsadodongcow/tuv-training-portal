'use client'
import { useMemo } from 'react'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { useSchedule, useSessionHealth } from '../hooks/data'
import { healthMeta } from '../lib/health'
import SessionRecord, { normaliseSessionTab } from '../components/SessionRecord'
import { StatusPill, Spinner, ErrorNote } from '../components/ui'
import { RecordHeader } from '../components/record'
import { lt, formatSegments } from '../lib/labels'

const canOps = (r: any) => ['operations', 'super_admin'].includes(r)

// The full-page session record: header + the shared tabbed body. Everything
// below the header lives in components/SessionRecord so the calendar drawer can
// render exactly the same thing.
export default function SessionDetail() {
  const params = useParams()
  const id = String(params.id)
  const router = useRouter()
  const pathname = usePathname()
  const search = useSearchParams()
  // Notes + History merged into one "Activity" tab; keep the old deep-links alive.
  const tab = normaliseSessionTab(search.get('tab'))
  const setTab = (t: string) => {
    const n = new URLSearchParams(search.toString())
    if (t === 'overview') n.delete('tab')
    else n.set('tab', t)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  const { profile } = useAuth()
  const role = profile?.role
  const sched = useSchedule(id)
  const healthAll = useSessionHealth()
  const healthMap = useMemo(
    () => new Map<string, string>((healthAll.data || []).map((h: any) => [h.schedule_id, h.health])),
    [healthAll.data]
  )

  if (sched.isLoading) return <Spinner label="Loading session" />
  if (sched.error) return <ErrorNote error={sched.error} />
  const schedule = sched.data
  if (!schedule) {
    return (
      <>
        <RecordHeader title="Session not found" back={{ href: '/calendar', label: 'Calendar' }} />
        <div className="card"><div className="empty">This session does not exist or you cannot access it.</div></div>
      </>
    )
  }

  return (
    <>
      <RecordHeader
        crumbs={[{ href: '/my-work', label: 'My Work' }, { href: '/calendar', label: 'Calendar' }, { label: schedule.course?.course_name || 'Session' }]}
        title={schedule.course?.course_name}
        subtitle={`${formatSegments(schedule.date_segments, schedule.start_date, schedule.end_date)} · ${lt(schedule.modality)} · ${schedule.course?.training_type}`}
        badges={
          <>
            <StatusPill value={schedule.status} />
            {/* Go/No-Go is the reason behind health, shown in the Go/No-Go panel below —
                not repeated as a second header pill. Header carries status + health only. */}
            {(() => {
              // Health duplicates the status once a session is Completed/Cancelled, so only show it while live.
              const h = healthMap.get(schedule.schedule_id)
              return h && h !== 'Completed' && h !== 'Cancelled'
                ? <span className={`pill ${healthMeta(h).cls}`}>{healthMeta(h).label}</span>
                : null
            })()}
            {schedule.private_run && <span className="pill pill-inhouse">Private run</span>}
            {schedule.roster_locked && <span className="pill pill-inside">Roster locked</span>}
          </>
        }
        actions={
          canOps(role) && <button className="btn btn-ghost btn-sm" onClick={() => router.push(`/session/${schedule.schedule_id}/edit`)}>Edit session</button>
        }
      />

      <SessionRecord scheduleId={id} tab={tab} onTabChange={setTab} />
    </>
  )
}
