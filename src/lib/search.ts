import type { Role } from './roles'

// Shared configuration for global record search (the `fn_global_search` RPC).
// One source of truth for what each record kind is called, where it links, and
// which roles may open it — consumed by both the ⌘K command palette and the
// full-page /search screen. The DB still scopes what each user actually sees on
// the record page; these gates only decide whether a hit is offered as a link.

// Read-facing kinds are visible to every role that can reach the record's screen.
const READ_ROLES: Role[] = ['super_admin', 'operations', 'business_owner', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor']

export interface SearchKind {
  label: string
  href: (id: string) => string
  roles: Role[]
}

export const SEARCH_KINDS: Record<string, SearchKind> = {
  order: { label: 'Order', href: (id) => `/orders/${id}`, roles: READ_ROLES },
  client: { label: 'Customer', href: (id) => `/clients/${id}`, roles: READ_ROLES },
  participant: { label: 'Participant', href: (id) => `/orders/${id}`, roles: READ_ROLES },
  session: { label: 'Session', href: (id) => `/session/${id}`, roles: READ_ROLES },
  organization: { label: 'Organization', href: (id) => `/organizations/${id}`, roles: READ_ROLES },
  course: { label: 'Course', href: () => `/courses`, roles: ['super_admin', 'operations'] },
  inquiry: { label: 'Inquiry', href: () => `/crm?tab=pipeline`, roles: ['super_admin', 'sales', 'coordinator', 'sales_manager', 'management', 'auditor'] },
}

// A single hit as returned by fn_global_search(kind, id, title, subtitle).
export interface SearchHit {
  kind: string
  id: string
  title: string | null
  subtitle: string | null
}

// Keep only the hits whose kind is both known and openable by this role.
export function visibleHits(hits: SearchHit[], role?: Role): SearchHit[] {
  return hits.filter((h) => !!role && SEARCH_KINDS[h.kind]?.roles.includes(role))
}
