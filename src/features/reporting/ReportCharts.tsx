import type { CSSProperties } from 'react'
import type { MonthlyDeliveryPoint, OutcomePoint, PipelinePoint } from './types'

function barStyle(value: number, maximum: number): CSSProperties {
  return { '--report-bar-size': `${maximum > 0 ? Math.max(2, Math.min(100, value / maximum * 100)) : 0}%` } as CSSProperties
}

export function DeliveryVolumeChart({ points }: { points: MonthlyDeliveryPoint[] }) {
  const maximum = Math.max(0, ...points.map((point) => point.capacity))
  return (
    <div className="report-bar-list" role="img" aria-label="Monthly enrolled participants compared with capacity">
      {points.map((point) => (
        <div className="report-bar-row" key={point.key}>
          <span>{point.label}</span>
          <div className="report-bar-track" style={barStyle(point.capacity, maximum)}><i /><b style={barStyle(point.enrolled, maximum)} /></div>
          <strong>{point.enrolled}/{point.capacity}</strong>
          <small>{point.sessions} session{point.sessions === 1 ? '' : 's'}</small>
        </div>
      ))}
    </div>
  )
}

export function PipelineChart({ points, formatCurrency }: { points: PipelinePoint[]; formatCurrency: (value: number) => string }) {
  const maximum = Math.max(0, ...points.map((point) => point.count))
  return (
    <div className="report-bar-list" role="img" aria-label="Orders grouped by workflow status">
      {points.map((point) => (
        <div className="report-bar-row" key={point.key}>
          <span className="capitalize">{point.label}</span>
          <div className="report-bar-track report-bar-single" style={barStyle(point.count, maximum)}><b /></div>
          <strong>{point.count}</strong>
          <small>{formatCurrency(point.value)}</small>
        </div>
      ))}
    </div>
  )
}

export function OutcomeChart({ points }: { points: OutcomePoint[] }) {
  const maximum = Math.max(0, ...points.map((point) => point.count))
  return (
    <div className="report-bar-list report-outcome-list" role="img" aria-label="Participant outcome status counts">
      {points.map((point) => (
        <div className="report-bar-row" key={point.key}>
          <span>{point.label}</span>
          <div className={`report-bar-track report-bar-single outcome-${point.key}`} style={barStyle(point.count, maximum)}><b /></div>
          <strong>{point.count}</strong>
        </div>
      ))}
    </div>
  )
}
