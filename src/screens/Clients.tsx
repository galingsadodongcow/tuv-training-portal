'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useClients, useAttribution } from '../hooks/data'
import { ErrorNote } from '../components/ui'
import { TableSkeleton } from '../components/Skeleton'
import { shortDate, num } from '../lib/format'
import { useSort } from '../hooks/useSort'
import { exportCsv } from '../lib/csv'

export default function Clients() {
  const router = useRouter()
  const clients = useClients()
  const attribution = useAttribution()
  const [tab, setTab] = useState('clients')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    // Hide soft-deleted customers. deleted_at is undefined before the migration,
    // so this is a no-op until the column exists.
    const live = (clients.data || []).filter((c: any) => !c.deleted_at)
    const t = q.trim().toLowerCase()
    if (!t) return live
    return live.filter(
      (c: any) => c.company?.toLowerCase().includes(t) || c.name?.toLowerCase().includes(t) || c.email?.toLowerCase().includes(t)
    )
  }, [clients.data, q])

  const bySales = useMemo(() => {
    if (!attribution.data) return []
    const map: Record<string, number> = {}
    for (const a of attribution.data) {
      const key = a.salesperson?.name || 'Unassigned'
      map[key] = (map[key] || 0) + (a.clients_brought || 0)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [attribution.data])

  const clientSort = useSort(filtered, (c: any, k: string) => (k === 'owner' ? c.salesperson?.name : c[k]), { key: 'company', dir: 'asc' })
  const exportClients = () =>
    exportCsv(
      'clients-' + new Date().toISOString().slice(0, 10),
      ['Company', 'Contact', 'Email', 'Phone', 'Owner'],
      clientSort.sorted.map((c: any) => [c.company, c.name, c.email, c.phone, c.salesperson?.name || ''])
    )

  if (clients.isLoading) return <TableSkeleton rows={8} cols={5} />
  if (clients.error) return <ErrorNote error={clients.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Clients and attribution</h1>
          <p>The client book everyone reads. Sales edit only their own. Attribution totals clients brought per salesperson.</p>
        </div>
      </div>

      <div className="filters">
        {['clients', 'attribution'].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? '' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t === 'clients' ? 'Clients' : 'Attribution'}
          </button>
        ))}
        {tab === 'clients' && (
          <>
            <input placeholder="Search company, name, email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 240 }} />
            <button className="btn btn-ghost btn-sm" onClick={exportClients} disabled={filtered.length === 0}>Export CSV</button>
          </>
        )}
      </div>

      {tab === 'clients' ? (
        <div className="card">
          <table>
            <thead>
              <tr>
                {([['company', 'Company'], ['name', 'Contact'], ['email', 'Email'], ['phone', 'Phone'], ['owner', 'Owner']] as const).map(([key, label]) => (
                  <th key={key} className="clickable" role="button" tabIndex={0}
                    aria-sort={clientSort.sort.key === key ? (clientSort.sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    onClick={() => clientSort.toggle(key)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); clientSort.toggle(key) } }}>
                    {label}{clientSort.indicator(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientSort.sorted.slice(0, 300).map((c: any) => (
                <tr key={c.client_id} className="clickable" role="button" tabIndex={0}
                  aria-label={`Open ${c.company || c.name || 'client'}`}
                  onClick={() => router.push(`/clients/${c.client_id}`)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/clients/${c.client_id}`) } }}>
                  <td style={{ fontWeight: 600 }}>{c.company || '—'}</td>
                  <td>{c.name || '—'}</td>
                  <td>{c.email || '—'}</td>
                  <td>{c.phone || '—'}</td>
                  <td>{c.salesperson?.name || <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <div className="empty">No clients match.</div>}
          {filtered.length > 300 && <div className="empty muted">Showing first 300 of {filtered.length}.</div>}
        </div>
      ) : attribution.error ? (
        <ErrorNote error={attribution.error} />
      ) : (
        <>
          <div className="grid kpis" style={{ marginBottom: 18 }}>
            {bySales.map(([name, total]) => (
              <div key={name} className="card card-pad kpi">
                <div className="k-label">{name}</div>
                <div className="k-value">{num(total)}</div>
                <div className="k-sub">clients brought</div>
              </div>
            ))}
          </div>
          <div className="card">
            <table>
              <thead>
                <tr><th>Salesperson</th><th>Session</th><th>Date</th><th className="right">Clients brought</th></tr>
              </thead>
              <tbody>
                {attribution.data?.map((a) => (
                  <tr key={a.attribution_id}>
                    <td>{a.salesperson?.name || '—'}</td>
                    <td>{a.schedule?.course?.course_name || '—'}</td>
                    <td>{shortDate(a.date_recorded)}</td>
                    <td className="right">{a.clients_brought}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {(!attribution.data || attribution.data.length === 0) && (
              <div className="empty">No attribution records yet. Sales log clients brought against sessions.</div>
            )}
          </div>
        </>
      )}
    </>
  )
}
