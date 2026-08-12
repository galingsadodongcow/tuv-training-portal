'use client'
import { createContext, useContext, useCallback, useEffect, useRef, useState, ReactNode, KeyboardEvent as ReactKeyboardEvent } from 'react'

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'default'
  // When set, the dialog shows a reason field. 'required' blocks confirm until
  // it is filled, matching the destructive-action rule: confirm and a reason.
  reason?: 'required' | 'optional'
  reasonLabel?: string
}
export interface ConfirmResult {
  ok: boolean
  reason?: string
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<ConfirmResult>
const Ctx = createContext<ConfirmFn | null>(null)

// A promise-based confirmation gate for destructive actions (cancellation,
// refund, reassignment, archive, price override, schedule changes). Await it,
// and only act when the result is ok.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const [reason, setReason] = useState('')
  const resolver = useRef<((r: ConfirmResult) => void) | null>(null)

  // The element focused before the dialog opened, so we can restore it on close.
  const restoreFocus = useRef<HTMLElement | null>(null)

  const confirm = useCallback<ConfirmFn>((o) => {
    restoreFocus.current = document.activeElement as HTMLElement | null
    setReason('')
    setOpts(o)
    return new Promise<ConfirmResult>((resolve) => { resolver.current = resolve })
  }, [])

  const close = (ok: boolean) => {
    resolver.current?.({ ok, reason: reason.trim() || undefined })
    resolver.current = null
    setOpts(null)
    // Return focus to whatever triggered the dialog.
    const el = restoreFocus.current
    restoreFocus.current = null
    if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0)
  }

  const reasonMissing = opts?.reason === 'required' && !reason.trim()
  const confirmBtn = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // On open, move focus into the dialog (the reason field autofocuses itself).
  useEffect(() => {
    if (opts && !opts.reason) confirmBtn.current?.focus()
  }, [opts])

  // Keep Tab focus inside the dialog while it is open.
  const trapFocus = (e: ReactKeyboardEvent) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const list = Array.from(focusable).filter((el) => !el.hasAttribute('disabled'))
    if (list.length === 0) return
    const first = list[0]
    const last = list[list.length - 1]
    const activeEl = document.activeElement as HTMLElement | null
    if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus() }
  }

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {opts && (
        <div className="dialog-scrim" onClick={() => close(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label={opts.title} ref={dialogRef}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false) } else { trapFocus(e) } }}>
            <div className="dialog-title">{opts.title}</div>
            {opts.body && <div className="dialog-body">{opts.body}</div>}
            {opts.reason && (
              <label className="field" style={{ marginTop: 10 }}>
                <span>{opts.reasonLabel || 'Reason'}{opts.reason === 'required' ? '' : ' (optional)'}</span>
                {opts.tone === 'danger' ? (
                  // Danger reasons (void/refund/cancel/return) get room for a real
                  // rationale; Cmd/Ctrl+Enter submits so multi-line stays possible.
                  <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                    onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !reasonMissing) close(true) }}
                    placeholder="Noted on the record" />
                ) : (
                  <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !reasonMissing) close(true) }}
                    placeholder="Noted on the record" />
                )}
              </label>
            )}
            <div className="toolbar" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => close(false)}>{opts.cancelLabel || 'Cancel'}</button>
              <button ref={confirmBtn} className={`btn btn-sm ${opts.tone === 'danger' ? 'btn-danger' : ''}`}
                disabled={reasonMissing} onClick={() => close(true)}>
                {opts.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useConfirm = (): ConfirmFn => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useConfirm must be used within ConfirmProvider')
  return c
}
