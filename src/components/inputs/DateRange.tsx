'use client'
import { ReactNode } from 'react'

export interface DateRangeValue { from: string; to: string }

// A from/to range picker with optional preset chips (#140). Presentational and
// controlled: the parent owns the value and resolves what each preset means
// (presets like "year to date" depend on "now", which the parent already knows),
// so this stays a reusable primitive over both day (`date`) and month (`month`)
// granularity. Editing either input switches the active preset to 'custom'.
export function DateRange({
  value, onChange, preset, onPreset, presets = [], granularity = 'date', label, fromLabel = 'Range from', toLabel = 'Range to',
}: {
  value: DateRangeValue
  onChange: (v: DateRangeValue) => void
  preset?: string
  onPreset?: (key: string) => void
  presets?: { key: string; label: string }[]
  granularity?: 'date' | 'month'
  label?: ReactNode
  fromLabel?: string
  toLabel?: string
}) {
  const type = granularity === 'month' ? 'month' : 'date'
  return (
    <div className="filters daterange">
      {presets.length > 0 && (
        <div className="seg">
          {presets.map((p) => (
            <button key={p.key} type="button" className={`seg-btn ${preset === p.key ? 'on' : ''}`} aria-pressed={preset === p.key}
              onClick={() => onPreset?.(p.key)}>{p.label}</button>
          ))}
        </div>
      )}
      <input type={type} aria-label={fromLabel} value={value.from}
        onChange={(e) => { onChange({ from: e.target.value, to: value.to || e.target.value }); onPreset?.('custom') }} />
      <span className="fill-label">to</span>
      <input type={type} aria-label={toLabel} value={value.to}
        onChange={(e) => { onChange({ from: value.from || e.target.value, to: e.target.value }); onPreset?.('custom') }} />
      {label != null && <span className="fill-label" style={{ marginLeft: 'auto' }}>{label}</span>}
    </div>
  )
}
