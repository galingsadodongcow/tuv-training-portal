'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuditSearch } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { exportCsv } from '../lib/csv'

const ACTIONS = ['', 'INSERT', 'UPDATE', 'DELETE']
const ROLES = ['', 'super_admin', 'operations', 'business_owner', 'sales']

// Best-effort deep link from an audited row to its record screen.
const linkFor = (table: string, pk: string) => {
  switch (table) {
    case 'orders': return `/orders/${pk}`
    case 'schedule': return `/session/${pk}`
    case 'client': return `/clients/${pk}`
    default: return null
  }
}

const changedText = (v: any): string => {
  if (v == null) return '—'
  if (Array.isArray(v)) return v.join(', ')
  if (typeof v === 'object') return Object.keys(v).join(', ')
  return String(v)
}

export default function AuditLog() {
  const [draft, setDraft] = useState({ table: '', action: '', role: '', from: '', to: '', search: '' })
  const [filters, setFilters] = useState<Record<string, any>>({ limit: 200 })
  const q = useAuditSearch(filters)

  const apply = () => setFilters({
    table: draft.table.trim(), action: draft.action, role: draft.role,
    from: draft.from ? new Date(draft.from).toISOString() : '',
    to: draft.to ? new Date(draft.to + 'T23:59:59').toISOString() : '',
    search: draft.search.trim(), limit: 200,
  })
  const reset = () => { setDraft({ table: '', action: '', role: '', from: '', to: '', search: '' }); setFilters({ limit: 200 }) }

  const rows = useMemo(() => q.data?.rows || [], [q.data?.rows])
  const rpcError = q.data?.error
  const csv = useMemo(() => () => exportCsv(
    'audit-log-' + new Date().toISOString().slice(0, 10),
    ['When', 'Table', 'Row', 'Action', 'Role', 'Fields'],
    rows.map((r: any) => [new Date(r.changed_at).toISOString(), r.table_name, r.row_pk, r.action, r.actor_role || '', changedText(r.changed_fields)])
  ), [rows])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every recorded change across the system. Filter by table, action, role, date, or free text.</p>
        </div>
        <button className="btn btn-ghost btn-sm" disabled={rows.length === 0} onClick={csv}>Export CSV</button>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="toolbar" style={{ flexWrap: 'wrap', gap: 10 }}>
          <input aria-label="Filter by table" placeholder="Table (e.g. orders)" value={draft.table} onChange={(e) => setDraft({ ...draft, table: e.target.value })} style={{ maxWidth: 160 }} />
          <select aria-label="Filter by action" value={draft.action} onChange={(e) => setDraft({ ...draft, action: e.target.value })}>
            {ACTIONS.map((a) => <option key={a} value={a}>{a || 'Any action'}</option>)}
          </select>
          <select aria-label="Filter by role" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r || 'Any role'}</option>)}
          </select>
          <label className="fill-label">From <input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} style={{ marginLeft: 4 }} /></label>
          <label className="fill-label">To <input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} style={{ marginLeft: 4 }} /></label>
          <input aria-label="Search row id or changed fields" placeholder="Search row or fields" value={draft.search} onChange={(e) => setDraft({ ...draft, search: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && apply()} style={{ minWidth: 200 }} />
          <button className="btn btn-sm" onClick={apply}>Search</button>
          <button className="btn btn-ghost btn-sm" onClick={reset}>Reset</button>
        </div>
      </div>

      {q.isLoading ? <Spinner label="Searching" /> : q.error ? <ErrorNote error={q.error} /> : rpcError ? (
        <div className="card"><div className="empty">Audit search is unavailable. Apply the Phase N migration to enable it.</div></div>
      ) : (
        <div className="card">
          {rows.length === 0 ? <div className="empty">No audit entries match.</div> : (
            <table>
              <thead><tr><th>When</th><th>Table</th><th>Row</th><th>Action</th><th>Role</th><th>Changed fields</th></tr></thead>
              <tbody>
                {rows.map((r: any) => {
                  const href = linkFor(r.table_name, r.row_pk)
                  return (
                    <tr key={r.audit_id}>
                      <td className="fill-label" style={{ whiteSpace: 'nowrap' }}>{new Date(r.changed_at).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td style={{ fontWeight: 600 }}>{r.table_name}</td>
                      <td className="fill-label">{href ? <Link href={href}>{r.row_pk}</Link> : r.row_pk}</td>
                      <td><span className="pill" style={{ borderColor: r.action === 'DELETE' ? 'var(--danger)' : undefined }}>{r.action}</span></td>
                      <td className="fill-label">{r.actor_role || '—'}</td>
                      <td className="fill-label">{changedText(r.changed_fields)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
          {rows.length >= 200 && <div className="fill-label" style={{ padding: 10, color: 'var(--text-faint)' }}>Showing the first 200 matches. Narrow the filters to see more.</div>}
        </div>
      )}
    </>
  )
}
