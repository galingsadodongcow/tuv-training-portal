export interface AuditEvent {
  id: number
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string
  reason: string | null
  details: Record<string, unknown>
  occurred_at: string
}

export interface AuditProfile {
  id: string
  full_name: string
}

export interface AuditWorkspace {
  events: AuditEvent[]
  profiles: AuditProfile[]
}
