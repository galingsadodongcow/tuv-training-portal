'use client'
import { useEffect, useRef, useState } from 'react'

export interface MultiOption { value: string; label: string }

// A checkbox-style multi-select dropdown (#140) — the primitive selects lacked
// (they are single-only). Controlled: pass the selected values + onChange. The
// button shows a summary ("All", one label, or "N selected"); the panel toggles
// each option and closes on outside-click or Escape.
export function MultiSelect({
  values, onChange, options, allLabel = 'All', ariaLabel,
}: {
  values: string[]
  onChange: (values: string[]) => void
  options: MultiOption[]
  allLabel?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggle = (v: string) =>
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v])

  const summary = values.length === 0
    ? allLabel
    : values.length === 1
      ? (options.find((o) => o.value === values[0])?.label ?? '1 selected')
      : `${values.length} selected`

  return (
    <div className="multiselect" ref={wrapRef}>
      <button type="button" className="multiselect-btn" aria-haspopup="listbox" aria-expanded={open}
        aria-label={ariaLabel} onClick={() => setOpen((o) => !o)}>
        {summary} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="multiselect-panel" role="listbox" aria-multiselectable="true" aria-label={ariaLabel}>
          {values.length > 0 && (
            <button type="button" className="multiselect-clear" onClick={() => onChange([])}>Clear all</button>
          )}
          {options.map((o) => {
            const on = values.includes(o.value)
            return (
              <label key={o.value} className="multiselect-opt" role="option" aria-selected={on}>
                <input type="checkbox" checked={on} onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
