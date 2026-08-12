'use client'
import { Fragment, useEffect, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useOrdersPaged } from '../hooks/data'
import { ErrorNote, ChannelPill } from '../components/ui'
import { TableSkeleton } from '../components/Skeleton'
import { php, shortDate } from '../lib/format'
import { formatSegments } from '../lib/labels'
import { exportCsv } from '../lib/csv'
import { primaryFlag, stageLabel } from '../lib/orderState'
import SavedViews from '../components/SavedViews'
import { FilterChip } from '../components/inputs/FilterChip'
import { Tooltip } from '../components/inputs/Tooltip'

const STAGES = ['New', 'In Communication', 'For Order Creation', 'Endorsed to Ops', 'SAP Created', 'No Feedback', 'Cancelled']
const PAGE_SIZE = 50

// The orders book. Rendered as the "Orders" tab of the CRM shell (`embedded`),
// where the shell owns the heading + tab strip. Reads its own q/stage/pay params
// from the URL, which coexist with the shell's ?tab=.
export default function Orders({ embedded }: { embedded?: boolean } = {}) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [page, setPage] = useState(0)

  const q = params.get('q') || ''
  const stage = params.get('stage') || 'all'
  const pay = params.get('pay') || 'all'
  const sortKey = params.get('sort') || ''
  const sortDir: 'asc' | 'desc' = params.get('dir') === 'asc' ? 'asc' : 'desc'
  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(params.toString())
    if (!v || v === 'all') n.delete(k)
    else n.set(k, v)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  // Sorting runs in the database across the whole filtered set (not just the
  // visible page). Clicking a header sets the sort in the URL and resets paging;
  // clicking the active column flips the direction.
  const toggleSort = (key: string) => {
    const n = new URLSearchParams(params.toString())
    if (sortKey === key) n.set('dir', sortDir === 'asc' ? 'desc' : 'asc')
    else { n.set('sort', key); n.set('dir', 'asc') }
    setPage(0)
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }
  const sortIndicator = (key: string) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '')

  // Reset to the first page whenever a filter changes.
  useEffect(() => setPage(0), [q, stage, pay])

  const query = useOrdersPaged({ page, pageSize: PAGE_SIZE, q, stage, pay, sortKey, sortDir })
  const rows: any[] = query.data?.rows || []
  const count = query.data?.count ?? 0
  const pageCount = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const from = count === 0 ? 0 : page * PAGE_SIZE + 1
  const to = Math.min(count, (page + 1) * PAGE_SIZE)

  const doExport = () => {
    exportCsv(
      `orders-${new Date().toISOString().slice(0, 10)}`,
      ['Order', 'Date', 'Customer', 'Stage', 'Payment', 'SAP', 'Channel', 'Seats', 'Amount'],
      rows.map((o) => [
        o.order_id, o.order_date, o.client?.company || o.client?.name || '',
        o.fulfillment_stage, o.payment_status, o.sap_order_no || '', o.channel, o.total_seats, o.total_amount,
      ])
    )
  }

  return (
    <>
      <div className="page-head">
        {!embedded && (
          <div>
            <h1>Orders</h1>
            <p>{count} order{count === 1 ? '' : 's'}. Filtered, sorted and paged in the database across all matches. One row per order — expand for its training lines.</p>
            <span className="k-sub">All amounts in PHP (₱)</span>
          </div>
        )}
        <div className="toolbar">
          <Tooltip label="Exports only the orders on the current page, not all matches.">
            <button className="btn btn-ghost btn-sm" onClick={doExport} disabled={rows.length === 0}>Export this page</button>
          </Tooltip>
        </div>
      </div>

      <div className="filters">
        <input placeholder="Search order # or SAP…" value={q} onChange={(e) => setParam('q', e.target.value)} style={{ minWidth: 240 }} />
        <select value={stage} onChange={(e) => setParam('stage', e.target.value)}>
          <option value="all">All stages</option>
          {STAGES.map((s) => (<option key={s} value={s}>{stageLabel(s)}</option>))}
        </select>
        <select value={pay} onChange={(e) => setParam('pay', e.target.value)}>
          <option value="all">All payments</option>
          {['Paid', 'Unpaid', 'Partial'].map((p) => (<option key={p}>{p}</option>))}
        </select>
      </div>

      {(q || stage !== 'all' || pay !== 'all') && (
        <div className="filters" style={{ marginTop: -6 }}>
          {q && <FilterChip label={`Search: ${q}`} onClear={() => setParam('q', '')} />}
          {stage !== 'all' && <FilterChip label={`Stage: ${stageLabel(stage)}`} onClear={() => setParam('stage', 'all')} />}
          {pay !== 'all' && <FilterChip label={`Payment: ${pay}`} onClear={() => setParam('pay', 'all')} />}
          <button className="btn btn-ghost btn-sm" onClick={() => { setParam('q', ''); setParam('stage', 'all'); setParam('pay', 'all') }}>Clear all</button>
        </div>
      )}

      <div className="filters" style={{ marginTop: -6 }}>
        <SavedViews surface="orders" paramKeys={['q', 'stage', 'pay', 'sort', 'dir']} />
      </div>

      {query.error ? (
        <ErrorNote error={query.error} />
      ) : query.isLoading && !query.data ? (
        <TableSkeleton rows={10} cols={8} />
      ) : (
        <>
          <div className="card" style={{ opacity: query.isFetching ? 0.6 : 1, transition: 'opacity 0.15s' }}>
            <table className="sticky-1">
              <thead>
                <tr>
                  {([['order_id', 'Order'], ['customer', 'Customer'], ['fulfillment_stage', 'Stage'], ['sap_order_no', 'SAP'], ['channel', 'Channel'], ['total_seats', 'Seats', 'right'], ['total_amount', 'Amount', 'right']] as const).map(([key, label, align]) => (
                    <th key={key} className={`clickable${align ? ' ' + align : ''}`} role="button" tabIndex={0}
                      aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      onClick={() => toggleSort(key)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(key) } }}>
                      {label}{sortIndicator(key)}
                    </th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <Fragment key={o.order_id}>
                    <tr className="clickable" role="button" tabIndex={0}
                      aria-label={`Open order ${o.order_id}`}
                      onClick={() => router.push(`/orders/${o.order_id}`)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); router.push(`/orders/${o.order_id}`) } }}>
                      <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {o.order_id}
                        <div className="fill-label">{shortDate(o.order_date)}</div>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{o.client?.company || o.client?.name || '—'}</div>
                        <div className="fill-label">
                          {o.lines?.length || 0} line{(o.lines?.length || 0) === 1 ? '' : 's'} ·{' '}
                          {o.assignment?.[0]?.salesperson?.name || 'unassigned'}
                        </div>
                      </td>
                      <td>
                        <span className="pill pill-webshop">{stageLabel(o.fulfillment_stage)}</span>
                        {(() => {
                          const f = primaryFlag(o)
                          return f ? (
                            <div className="fill-label" style={{ marginTop: 4, color: f.tone === 'danger' ? 'var(--tr-red)' : f.tone === 'warn' ? 'var(--tr-amber)' : 'inherit' }}>
                              {f.label}
                            </div>
                          ) : null
                        })()}
                      </td>
                      <td className="fill-label">{o.sap_order_no || '—'}</td>
                      <td><ChannelPill value={o.channel} /></td>
                      <td className="right">{o.total_seats}</td>
                      <td className="right">{php(o.total_amount)}</td>
                      <td className="right" onClick={(e) => e.stopPropagation()}>
                        {(o.lines?.length || 0) > 1 && (
                          <button className="linkbtn" onClick={() => setExpanded({ ...expanded, [o.order_id]: !expanded[o.order_id] })}>
                            {expanded[o.order_id] ? 'Hide' : 'Lines'}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expanded[o.order_id] &&
                      o.lines?.map((l: any) => (
                        <tr key={l.line_id} style={{ background: 'var(--bg-subtle)' }}>
                          <td></td>
                          <td colSpan={3} className="fill-label">
                            {l.line_no}. {l.course?.course_name}
                            {l.schedule && ` · ${formatSegments(l.schedule.date_segments, l.schedule.start_date, l.schedule.end_date)}`}
                          </td>
                          <td className="fill-label">{l.line_status}</td>
                          <td className="right fill-label">{l.seats}</td>
                          <td className="right fill-label">{php(l.amount_php)}</td>
                          <td></td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div className="empty">No orders match.</div>}
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
      )}
    </>
  )
}
