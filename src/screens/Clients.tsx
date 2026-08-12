'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useClientsPaged, useAttribution } from '../hooks/data'
import { ErrorNote } from '../components/ui'
import { TableSkeleton } from '../components/Skeleton'
import { shortDate, num } from '../lib/format'
import { exportCsv } from '../lib/csv'

const PAGE_SIZE = 50

export default function Clients() {
  const router = useRouter()
  const params = useSearchParams()
  const pathname = usePathname()
  const attribution = useAttribution()
  const [tab, setTab] = useState('clients')
  const [page, setPage] = useState(0)

  // Search and sort live in the URL so a view survives navigation (#128).
  const q = params.get('q') || ''
  const sortKey = params.get('sort') || 'company'
  const sortDir: 'asc' | 'desc' = params.get('dir') === 'desc' ? 'desc' : 'asc'
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params.toString())
    if (!v) n.delete(k)
    else n.set(k, v)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  // Sorting runs in the database across every match, not just the visible page.
  // Clicking a header sets the sort in the URL and resets paging; clicking the
  // active column flips the direction.
  const toggleSort = (key: string) => {
    const n = new URLSearchParams(params.toString())
    if (sortKey === key) n.set('dir', sortDir === 'asc' ? 'desc' : 'asc')
    else { n.set('sort', key); n.set('dir', 'asc') }
    setPage(0)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const sortIndicator = (key: string) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  // Reset to the first page whenever the search changes.
  useEffect(() => setPage(0), [q])

  const clients = useClientsPaged({ page, pageSize: PAGE_SIZE, q, sortKey, sortDir })
  const rows: any[] = clients.data?.rows || []
  const count = clients.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const from = count === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(count, (page + 1) * PAGE_SIZE)

  const bySales = useMemo(() => {
    if (!attribution.data) return []
    const map: Record<string, number> = {}
    for (const a of attribution.data) {
      const key = a.salesperson?.name || 'Unassigned'
      map[key] = (map[key] || 0) + (a.clients_brought || 0)
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1])
  }, [attribution.data])

  const exportClients = () =>
    exportCsv(
      'clients-' + new Date().toISOString().slice(0, 10),
      ['Company', 'Contact', 'Email', 'Phone', 'Owner'],
      rows.map((c: any) => [c.company, c.name, c.email, c.phone, c.salesperson?.name || ''])
    )

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
            <input placeholder="Search company, name, email…" defaultValue={q} onChange={(e) => setParam('q', e.target.value)} style={{ minWidth: 240 }} />
            <button className="btn btn-ghost btn-sm" onClick={exportClients} disabled={rows.length === 0}
              title="Exports only the clients on the current page, not all matches.">Export this page</button>
          </>
        )}
      </div>

      {tab === 'clients' ? (
        clients.error ? (
          <ErrorNote error={clients.error} />
        ) : clients.isLoading && !clients.data ? (
          <TableSkeleton rows={8} cols={5} />
        ) : (
          <>
            <div className="card" style={{ opacity: clients.isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
              <table>
                <thead>
                  <tr>
                    {([['company', 'Company'], ['name', 'Contact'], ['email', 'Email'], ['phone', 'Phone'], ['owner', 'Owner']] as const).map(([key, label]) => (
                      <th key={key} className="clickable" role="button" tabIndex={0}
                        aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        onClick={() => toggleSort(key)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(key) } }}>
                        {label}{sortIndicator(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c: any) => (
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
              {rows.length === 0 && <div className="empty">No clients match.</div>}
            </div>

            <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 14 }}>
              <span className="fill-label">{from}–{to} of {count}</span>
              <div className="toolbar">
                <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>← Prev</button>
                <span className="fill-label">Page {page + 1} of {pageCount}</span>
                <button className="btn btn-ghost btn-sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next →</button>
              </div>
            </div>
          </>
        )
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
