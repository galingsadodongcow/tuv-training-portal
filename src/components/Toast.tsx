'use client'
import { createContext, useContext, useCallback, useState, ReactNode } from 'react'

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem {
  id: number
  kind: ToastKind
  message: string
}
interface ToastCtx {
  toast: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}
const Ctx = createContext<ToastCtx | null>(null)
let idSeq = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const remove = (id: number) => setToasts((t) => t.filter((x) => x.id !== id))

  const toast = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++idSeq
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => remove(id), 4500)
  }, [])

  const value: ToastCtx = {
    toast,
    success: (m) => toast(m, 'success'),
    error: (m) => toast(m, 'error'),
    info: (m) => toast(m, 'info'),
  }

  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="toaster" role="region" aria-live="polite" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => remove(t.id)} role="status">
            <span className="toast-dot" />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = (): ToastCtx => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast must be used within ToastProvider')
  return c
}
