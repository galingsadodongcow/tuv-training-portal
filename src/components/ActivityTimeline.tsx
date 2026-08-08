'use client'
import { ActivityEvent, KIND_LABEL } from '../lib/activity'

const KIND_TONE: Record<ActivityEvent['kind'], string> = {
  note: 'pill-webshop',
  approval: 'pill-go',
  task: 'pill-tentative',
  notification: 'pill-inside',
  audit: 'pill-cancelled',
}

const when = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''

// One chronological rail for a record. Fed normalized events from any mix of
// notes, decisions, tasks, notifications, and audit rows.
export default function ActivityTimeline({ events, loading }: { events: ActivityEvent[]; loading?: boolean }) {
  if (loading) return <div className="empty">Loading…</div>
  if (events.length === 0) return <div className="empty">No activity recorded yet.</div>
  return (
    <div className="timeline">
      {events.map((e) => (
        <div key={e.id} className="timeline-row">
          <div className="timeline-rail"><span className="timeline-dot" /></div>
          <div className="timeline-body">
            <div className="timeline-head">
              <span className={`pill ${KIND_TONE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
              <span className="timeline-title">{e.title}</span>
              <span className="fill-label timeline-when">{when(e.at)}</span>
            </div>
            {e.detail && <div className="timeline-detail">{e.detail}</div>}
            {e.meta && <div className="fill-label">{e.meta}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
