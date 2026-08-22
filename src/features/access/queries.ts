import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/auth'

export interface AuditEvent {
  id: number
  actor_id: string | null
  action: string
  entity_type: string
  entity_id: string
  reason: string | null
  occurred_at: string
}

export async function getManagedProfiles(): Promise<Profile[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active, is_sales_supervisor')
    .order('full_name')

  if (error) throw new Error('User access records could not be loaded.')
  return (data ?? []) as Profile[]
}

export async function getRecentAuditEvents(): Promise<AuditEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('audit_events')
    .select('id, actor_id, action, entity_type, entity_id, reason, occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(20)

  if (error) throw new Error('Audit activity could not be loaded.')
  return (data ?? []) as AuditEvent[]
}
