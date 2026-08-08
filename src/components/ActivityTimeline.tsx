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

// Never hand React an object as a child. Coerce anything non-primitive to a
// readable string so one odd event can't blank the whole record page.
const text = (v: any): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(text).filter(Boolean).join(', ')
  if (typeof v === 'object') return Object.keys(v).join(', ')
  return String(v)
}

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
              <span className="timeline-title">{text(e.title)}</span>
              <span className="fill-label timeline-when">{when(e.at)}</span>
            </div>
            {e.detail && <div className="timeline-detail">{text(e.detail)}</div>}
            {e.meta && <div className="fill-label">{text(e.meta)}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
