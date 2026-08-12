'use client'
import { useId, useState, ReactNode } from 'react'

// A hover/focus text tooltip (#140) — replaces native title= (which never shows
// on keyboard focus and is unstyled). The trigger is described by the tip via
// aria-describedby, and the tip appears on both hover and keyboard focus so it is
// reachable without a mouse. Wrap any focusable trigger.
export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactNode; side?: 'top' | 'bottom' }) {
  const [show, setShow] = useState(false)
  const id = useId()
  return (
    <span className="tooltip-wrap"
      onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
      onFocusCapture={() => setShow(true)} onBlurCapture={() => setShow(false)}>
      <span aria-describedby={show ? id : undefined}>{children}</span>
      {show && (
        <span role="tooltip" id={id} className={`tooltip tooltip-${side}`}>{label}</span>
      )}
    </span>
  )
}
