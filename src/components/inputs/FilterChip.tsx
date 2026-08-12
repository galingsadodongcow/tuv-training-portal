'use client'
import { ReactNode } from 'react'

// A removable active-filter chip (#140) — shows a "Field: value" token with an ×
// that clears just that filter. Used above filterable tables so the active
// filters are visible and individually dismissable, not buried in selects.
export function FilterChip({ label, onClear }: { label: ReactNode; onClear: () => void }) {
  return (
    <span className="filter-chip">
      <span className="filter-chip-label">{label}</span>
      <button type="button" className="filter-chip-x" aria-label={`Clear filter: ${typeof label === 'string' ? label : ''}`} onClick={onClear}>×</button>
    </span>
  )
}
