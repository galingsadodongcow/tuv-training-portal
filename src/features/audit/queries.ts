import { createClient } from '@/lib/supabase/server'
import type { AuditWorkspace } from './types'

export async function getAuditWorkspace(filters: { action?: string; entity?: string }): Promise<AuditWorkspace> {
  const supabase = await createClient()
  let eventsQuery = supabase.from('audit_events')
    .select('id, actor_id, action, entity_type, entity_id, reason, details, occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(200)
  if (filters.action) eventsQuery = eventsQuery.ilike('action', `%${filters.action}%`)
  if (filters.entity) eventsQuery = eventsQuery.eq('entity_type', filters.entity)

  const [events, profiles] = await Promise.all([
    eventsQuery,
    supabase.from('profiles').select('id, full_name').eq('is_active', true).order('full_name'),
  ])
  if (events.error || profiles.error) throw new Error('Audit history could not be loaded.')
  return {
    events: (events.data ?? []) as AuditWorkspace['events'],
    profiles: (profiles.data ?? []) as AuditWorkspace['profiles'],
  }
}
