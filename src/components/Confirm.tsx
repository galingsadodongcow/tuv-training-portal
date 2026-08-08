'use client'
import { createContext, useContext, useCallback, useRef, useState, ReactNode } from 'react'

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

  const confirm = useCallback<ConfirmFn>((o) => {
    setReason('')
    setOpts(o)
    return new Promise<ConfirmResult>((resolve) => { resolver.current = resolve })
  }, [])

  const close = (ok: boolean) => {
    resolver.current?.({ ok, reason: reason.trim() || undefined })
    resolver.current = null
    setOpts(null)
  }

  const reasonMissing = opts?.reason === 'required' && !reason.trim()

  return (
    <Ctx.Provider value={confirm}>
      {children}
      {opts && (
        <div className="dialog-scrim" onClick={() => close(false)}>
          <div className="dialog" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="dialog-title">{opts.title}</div>
            {opts.body && <div className="dialog-body">{opts.body}</div>}
            {opts.reason && (
              <label className="field" style={{ marginTop: 10 }}>
                <span>{opts.reasonLabel || 'Reason'}{opts.reason === 'required' ? '' : ' (optional)'}</span>
                <input autoFocus value={reason} onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !reasonMissing) close(true) }}
                  placeholder="Noted on the record" />
              </label>
            )}
            <div className="toolbar" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => close(false)}>{opts.cancelLabel || 'Cancel'}</button>
              <button className={`btn btn-sm ${opts.tone === 'danger' ? 'btn-danger' : ''}`}
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
