'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useAllNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from '@/hooks/data'
import { Spinner, ErrorNote } from './ui'

// Deep-link a notification to the record it is about.
function entityHref(type?: string, id?: string): string | null {
  if (!type || !id) return null
  switch (type) {
    case 'orders':
    case 'order': return `/orders/${id}`
    case 'schedule':
    case 'session': return `/session/${id}`
    case 'client': return `/clients/${id}`
    case 'organization': return `/organizations/${id}`
    case 'quote': return `/quotations/${id}`
    case 'inquiry': return `/crm?tab=pipeline`
    case 'approval': return `/approvals`
    default: return null
  }
}

function ago(ts?: string): string {
  if (!ts) return ''
  const d = (Date.now() - new Date(ts).getTime()) / 1000
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  return `${Math.floor(d / 86400)}d ago`
}

export default function NotificationCenter() {
  const { profile } = useAuth()
  const uid = profile?.user_id
  const [open, setOpen] = useState(false)
  const q = useAllNotifications(uid)
  const markRead = useMarkNotificationRead()
  const markAll = useMarkAllNotificationsRead()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const rows: any[] = q.data || []
  const unread = rows.filter((r) => !r.is_read).length

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  if (!uid) return null

  return (
    <div ref={wrapRef} className="notif-wrap">
      <button
        className="notif-bell"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="notif-count" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif-panel" role="dialog" aria-modal="false" aria-label="Notifications">
          <div className="notif-head">
            <strong>Notifications</strong>
            {unread > 0 && (
              <button className="linkbtn" onClick={() => markAll.mutate(uid)} disabled={markAll.isPending}>
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-body">
            {q.isLoading ? (
              <div style={{ padding: 16 }}><Spinner label="Loading" /></div>
            ) : q.error ? (
              <div style={{ padding: 12 }}><ErrorNote error={q.error} /></div>
            ) : rows.length === 0 ? (
              <div className="notif-empty">You’re all caught up.</div>
            ) : (
              rows.map((r) => {
                const href = entityHref(r.entity_type, r.entity_id)
                const body = (
                  <>
                    <div className="notif-row-top">
                      <span className={`notif-dot ${r.is_read ? 'read' : ''}`} aria-hidden="true" />
                      <span className="notif-title">{r.title}</span>
                      <span className="notif-time">{ago(r.created_at)}</span>
                    </div>
                    {r.body && <div className="notif-text">{r.body}</div>}
                  </>
                )
                const onOpen = () => { if (!r.is_read) markRead.mutate(r.notif_id); setOpen(false) }
                return href ? (
                  <Link key={r.notif_id} href={href} className={`notif-row ${r.is_read ? 'is-read' : ''}`} onClick={onOpen}>
                    {body}
                  </Link>
                ) : (
                  <button key={r.notif_id} className={`notif-row ${r.is_read ? 'is-read' : ''}`} onClick={onOpen}>
                    {body}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
