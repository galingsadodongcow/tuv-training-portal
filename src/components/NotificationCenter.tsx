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
    // No standalone detail route for these two — deep-link to the list and let
    // the screen scroll to + highlight the specific record via ?focus= (#139).
    case 'inquiry': return `/crm?tab=pipeline&focus=${id}`
    case 'approval': return `/approvals?focus=${id}`
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

// Per-kind icon + whether it's something the user must act on. The
// notification.kind CHECK is {mention, assignment, approval, system, info};
// mentions/assignments/approvals go in "Needs action", the rest are FYI (#131).
const KIND_META: Record<string, { icon: string; label: string; action: boolean }> = {
  mention: { icon: '💬', label: 'Mention', action: true },
  assignment: { icon: '📥', label: 'Assigned', action: true },
  approval: { icon: '✅', label: 'Approval', action: true },
  system: { icon: '⚙️', label: 'System', action: false },
  info: { icon: 'ℹ️', label: 'Info', action: false },
}
const kindMeta = (k?: string) => KIND_META[k || ''] || { icon: '🔔', label: 'Update', action: false }

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

  const renderRow = (r: any) => {
    const meta = kindMeta(r.kind)
    const href = entityHref(r.entity_type, r.entity_id)
    const onOpen = () => { if (!r.is_read) markRead.mutate(r.notif_id); setOpen(false) }
    const body = (
      <>
        <span className="notif-kind" aria-hidden="true">{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="notif-row-top">
            <span className={`notif-dot ${r.is_read ? 'read' : ''}`} aria-hidden="true" />
            <span className="notif-title">{r.title}</span>
            <span className="notif-time">{ago(r.created_at)}</span>
          </div>
          {r.body && <div className="notif-text" style={{ marginLeft: 0 }}>{r.body}</div>}
        </div>
      </>
    )
    return href ? (
      <Link key={r.notif_id} href={href} className={`notif-row notif-flex ${r.is_read ? 'is-read' : ''}`} onClick={onOpen}>{body}</Link>
    ) : (
      <button key={r.notif_id} className={`notif-row notif-flex ${r.is_read ? 'is-read' : ''}`} onClick={onOpen}>{body}</button>
    )
  }

  // A titled group of notifications; renders nothing when the group is empty so
  // the header never sits over a blank section.
  const renderGroup = (title: string, items: any[]) =>
    items.length === 0 ? null : (
      <div className="notif-group">
        <div className="notif-group-head">{title} <span className="notif-group-count">{items.length}</span></div>
        {items.map(renderRow)}
      </div>
    )

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
              <>
                {renderGroup('Needs action', rows.filter((r) => kindMeta(r.kind).action))}
                {renderGroup('For your information', rows.filter((r) => !kindMeta(r.kind).action))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
