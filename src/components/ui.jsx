export function Spinner({ label }) {
  return (
    <div className="empty">
      <span className="spinner" />
      {label && <div style={{ marginTop: 10 }} className="muted">{label}</div>}
    </div>
  )
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  )
}

export function ErrorNote({ error }) {
  return <div className="notice notice-error">{String(error?.message || error)}</div>
}

const STATUS_CLASS = {
  Confirmed: 'pill-confirmed',
  Tentative: 'pill-tentative',
  Cancelled: 'pill-cancelled',
  Running: 'pill-running',
  Completed: 'pill-completed',
  New: 'pill-tentative',
}
export function StatusPill({ value }) {
  return <span className={`pill ${STATUS_CLASS[value] || 'pill-cancelled'}`}>{value}</span>
}

export function GoPill({ value }) {
  return <span className={`pill ${value === 'Go' ? 'pill-go' : 'pill-nogo'}`}>{value}</span>
}

const CHANNEL_CLASS = {
  Webshop: 'pill-webshop',
  'Inside Sales': 'pill-inside',
  'Field Sales': 'pill-field',
  'In-house Request': 'pill-inhouse',
}
export function ChannelPill({ value }) {
  return <span className={`pill ${CHANNEL_CLASS[value] || 'pill-webshop'}`}>{value}</span>
}

export function FillBar({ booked, min }) {
  const target = min || 0
  const pct = target > 0 ? Math.min(100, Math.round((booked / target) * 100)) : booked > 0 ? 100 : 0
  const ok = target > 0 && booked >= target
  return (
    <div>
      <div className={`fill ${ok ? 'fill-ok' : 'fill-low'}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="fill-label">
        {booked} / {target || '—'} pax
      </div>
    </div>
  )
}
