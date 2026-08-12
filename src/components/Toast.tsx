'use client'
import { createContext, useContext, useCallback, useRef, useState, KeyboardEvent, ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'
// An optional in-toast action — used for "Undo" on soft-removals/cancels/archives
// (#137). Running it dismisses the toast.
export interface ToastAction { label: string; onClick: () => void }
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
}
interface ToastCtx {
  toast: (message: string, kind?: ToastKind, action?: ToastAction) => void
  success: (message: string, action?: ToastAction) => void
  error: (message: string) => void
  info: (message: string) => void
}
const Ctx = createContext<ToastCtx | null>(null)
let idSeq = 0

// Errors linger a little longer than transient success/info so a screen-reader
// user (and anyone reading) has time to react before auto-dismiss. A toast that
// carries an action (Undo) gets the longer window too, so the net isn't yanked
// away mid-decision.
const DURATION: Record<ToastKind, number> = { error: 8000, success: 4500, info: 4500 }
const ACTION_DURATION = 8000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const remove = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
    setToasts((list) => list.filter((x) => x.id !== id))
  }, [])

  const arm = useCallback((id: number, ms: number) => {
    const existing = timers.current.get(id)
    if (existing) clearTimeout(existing)
    timers.current.set(id, setTimeout(() => remove(id), ms))
  }, [remove])

  const disarm = useCallback((id: number) => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const toast = useCallback((message: string, kind: ToastKind = 'info', action?: ToastAction) => {
    const id = ++idSeq
    setToasts((t) => [...t, { id, kind, message, action }])
    arm(id, action ? ACTION_DURATION : DURATION[kind])
  }, [arm])

  const value: ToastCtx = {
    toast,
    success: (m, action) => toast(m, 'success', action),
    error: (m) => toast(m, 'error'),
    info: (m) => toast(m, 'info'),
  }

  const onToastKey = (e: KeyboardEvent, id: number) => {
    if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') { e.preventDefault(); remove(id) }
  }

  // Errors are announced assertively; everything else politely (WCAG 4.1.3).
  const errors = toasts.filter((t) => t.kind === 'error')
  const others = toasts.filter((t) => t.kind !== 'error')

  const renderToast = (t: ToastItem) => (
    <div
      key={t.id}
      className={`toast toast-${t.kind}`}
      role={t.kind === 'error' ? 'alert' : 'status'}
      tabIndex={0}
      // Pause auto-dismiss while hovered or focused so it can't slip away mid-read.
      onMouseEnter={() => disarm(t.id)}
      onMouseLeave={() => arm(t.id, DURATION[t.kind])}
      onFocus={() => disarm(t.id)}
      onBlur={() => arm(t.id, DURATION[t.kind])}
      onKeyDown={(e) => onToastKey(e, t.id)}
    >
      <span className="toast-dot" />
      <span>{t.message}</span>
      {t.action && (
        <button
          type="button"
          className="toast-action"
          onClick={() => { t.action!.onClick(); remove(t.id) }}
          style={{ marginLeft: 'auto' }}
        >
          {t.action.label}
        </button>
      )}
      <button
        type="button"
        className="toast-close"
        aria-label="Dismiss notification"
        onClick={() => remove(t.id)}
        style={{ marginLeft: t.action ? 4 : 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}
      >
        ×
      </button>
    </div>
  )

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toaster" role="region" aria-label="Notifications">
        <div aria-live="assertive">
          {errors.map(renderToast)}
        </div>
        <div aria-live="polite">
          {others.map(renderToast)}
        </div>
      </div>
    </Ctx.Provider>
  )
}

export const useToast = (): ToastCtx => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be used within ToastProvider')
  return c
}
