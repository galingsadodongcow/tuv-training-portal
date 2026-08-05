import { ReactNode } from 'react'

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="empty">
      <span className="spinner" />
      {label && (
        <div style={{ marginTop: 10 }} className="muted">
          {label}
        </div>
      )}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  )
}

export function ErrorNote({ error }: { error: any }) {
  return <div className="notice notice-error">{String(error?.message || error)}</div>
}

const STATUS_CLASS: Record<string, string> = {
  Confirmed: 'pill-confirmed',
  Tentative: 'pill-tentative',
  Cancelled: 'pill-cancelled',
  Running: 'pill-running',
  Completed: 'pill-completed',
  New: 'pill-tentative',
}
export function StatusPill({ value }: { value: string }) {
  return <span className={`pill ${STATUS_CLASS[value] || 'pill-cancelled'}`}>{value}</span>
}

export function GoPill({ value }: { value: string }) {
  return <span className={`pill ${value === 'Go' ? 'pill-go' : 'pill-nogo'}`}>{value}</span>
}

const CHANNEL_CLASS: Record<string, string> = {
  Webshop: 'pill-webshop',
  'Inside Sales': 'pill-inside',
  'Field Sales': 'pill-field',
  'In-house Request': 'pill-inhouse',
}
export function ChannelPill({ value }: { value: string }) {
  return <span className={`pill ${CHANNEL_CLASS[value] || 'pill-webshop'}`}>{value}</span>
}

export function FillBar({ booked, min }: { booked: number; min: number }) {
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
        {target > 0 && booked < target && (
          <span style={{ color: 'var(--tr-amber)', fontWeight: 600 }}> · {target - booked} to Go</span>
        )}
      </div>
    </div>
  )
}
