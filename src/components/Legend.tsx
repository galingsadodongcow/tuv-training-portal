'use client'
import { useEffect, useRef, useState, ReactNode } from 'react'

export interface LegendItem { label: ReactNode; desc: string }

// A "?" popover that explains the statuses on a screen (#139) — click to open a
// small panel keying each status pill to a one-line meaning, so the vocabulary
// is self-teaching. Closes on outside-click or Escape.
export function Legend({ title, items, ariaLabel = 'What the statuses mean' }: { title: string; items: LegendItem[]; ariaLabel?: string }) {
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

  return (
    <div className="legend" ref={wrapRef}>
      <button type="button" className="legend-btn" aria-haspopup="dialog" aria-expanded={open}
        aria-label={ariaLabel} onClick={() => setOpen((o) => !o)}>?</button>
      {open && (
        <div className="legend-panel" role="dialog" aria-label={title}>
          <div className="legend-title">{title}</div>
          <dl className="legend-list">
            {items.map((it, i) => (
              <div key={i} className="legend-row">
                <dt>{it.label}</dt>
                <dd>{it.desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  )
}
