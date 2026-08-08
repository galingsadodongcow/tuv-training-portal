// Normalize the different record event sources into one shape, so a single
// timeline can show notes, decisions, system tasks, notifications, and audit
// entries together in time order. Each source is optional; whatever exists gets
// merged.

export interface ActivityEvent {
  id: string
  at: string | null
  kind: 'note' | 'approval' | 'task' | 'notification' | 'audit'
  title: string
  detail?: string
  meta?: string
}

export const KIND_LABEL: Record<ActivityEvent['kind'], string> = {
  note: 'Note',
  approval: 'Decision',
  task: 'Task',
  notification: 'Notice',
  audit: 'Change',
}

export function noteEvents(rows: any[] = []): ActivityEvent[] {
  return rows.map((n) => ({
    id: `note-${n.note_id}`,
    at: n.date,
    kind: 'note',
    title: `${n.profile?.full_name || 'User'} added a note`,
    detail: n.note,
    meta: n.profile?.role,
  }))
}

export function approvalEvents(rows: any[] = []): ActivityEvent[] {
  return rows.map((a) => ({
    id: `appr-${a.approval_id}`,
    at: a.decision_date || a.created_at,
    kind: 'approval',
    title: `${a.object_type} · ${a.decision}`,
    detail: a.note || undefined,
  }))
}

export function taskEvents(rows: any[] = []): ActivityEvent[] {
  return rows.map((t) => ({
    id: `task-${t.task_id}`,
    at: t.completed_at || t.created_at,
    kind: 'task',
    title: `${t.title}${t.completed_at ? ' · done' : ''}`,
    detail: t.reason || t.detail || undefined,
    meta: t.source === 'system' ? 'system' : undefined,
  }))
}

export function notificationEvents(rows: any[] = []): ActivityEvent[] {
  return rows.map((n) => ({
    id: `notif-${n.notif_id}`,
    at: n.created_at,
    kind: 'notification',
    title: n.title,
    detail: n.body || undefined,
    meta: n.kind,
  }))
}

export function auditEvents(rows: any[] = []): ActivityEvent[] {
  return rows.map((a) => ({
    id: `audit-${a.audit_id}`,
    at: a.changed_at,
    kind: 'audit',
    title: `${a.action} ${a.table_name}`,
    detail: Array.isArray(a.changed_fields) ? a.changed_fields.join(', ') : (a.changed_fields || undefined),
    meta: a.actor_role,
  }))
}

// Merge all sources newest first. Events without a timestamp sort to the end.
export function mergeActivity(...groups: ActivityEvent[][]): ActivityEvent[] {
  return groups
    .flat()
    .sort((a, b) => {
      const x = a.at ? +new Date(a.at) : 0
      const y = b.at ? +new Date(b.at) : 0
      return y - x
    })
}
