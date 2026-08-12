'use client'
import { useEffect, RefObject } from 'react'

// Trap Tab focus inside an open modal and restore focus to the trigger on close
// (#135, WCAG 2.4.3). Escape/close stays with the caller; this only manages
// focus. Mirrors the trap already used in Confirm.tsx / the command palette so
// record & session drawers behave the same way. Pass the dialog container ref
// and whether the modal is currently open.
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const restore = document.activeElement as HTMLElement | null

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
        .filter((el) => !el.hasAttribute('disabled') && el.offsetParent !== null)

    // Move focus into the dialog if it isn't already there.
    if (!node.contains(document.activeElement)) {
      const first = focusables()[0]
      ;(first || node).focus?.()
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const list = focusables()
      if (list.length === 0) { e.preventDefault(); return }
      const first = list[0]
      const last = list[list.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus() }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      if (restore && typeof restore.focus === 'function') setTimeout(() => restore.focus(), 0)
    }
  }, [ref, active])
}
