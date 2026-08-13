'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Role } from '../lib/roles'
import { SEARCH_KINDS, visibleHits, SearchHit } from '../lib/search'
import { Spinner, Empty, ErrorNote } from '../components/ui'

// Full-page global search — the same fn_global_search RPC that powers ⌘K, given
// a permanent home so a record can be found without the palette (the auditor's
// primary way in, and a fallback for every role once supporting entities leave
// the nav). Results link to the record routes; the DB scopes what each user can
// actually open. Deep-linkable via ?q= so a search is shareable and survives a
// refresh.
export default function Search() {
  const { profile } = useAuth()
  const role = profile?.role as Role | undefined
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  const urlQ = params.get('q') || ''
  const [q, setQ] = useState(urlQ)
  const [results, setResults] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // The last term we actually searched, so the "no matches" copy names it.
  const [searched, setSearched] = useState('')
  // Recent searches (#136) — kept in localStorage so a repeat lookup is one click.
  const [recent, setRecent] = useState<string[]>([])
  const timer = useRef<any>(null)
  const requestId = useRef(0)

  useEffect(() => {
    try {
      const r = JSON.parse(localStorage.getItem('search_recent') || '[]')
      if (Array.isArray(r)) setRecent(r.filter((t) => typeof t === 'string').slice(0, 8))
    } catch { /* ignore */ }
  }, [])
  const pushRecent = (term: string) => {
    setRecent((prev) => {
      const next = [term, ...prev.filter((t) => t.toLowerCase() !== term.toLowerCase())].slice(0, 8)
      try { localStorage.setItem('search_recent', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }
  const clearRecent = () => { setRecent([]); try { localStorage.removeItem('search_recent') } catch { /* ignore */ } }

  // Keep the input in sync when the URL changes underneath us (e.g. a shared
  // link or the browser back button), without clobbering active typing.
  useEffect(() => { setQ(urlQ) }, [urlQ])

  // Debounced search; mirror the ?q param so the URL stays shareable.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const t = q.trim()
    const id = ++requestId.current
    // Reflect the term in the URL (replace, so typing doesn't stack history).
    const next = t ? `${pathname}?q=${encodeURIComponent(t)}` : pathname
    const current = `${pathname}${urlQ ? `?q=${encodeURIComponent(urlQ)}` : ''}`
    if (next !== current) router.replace(next, { scroll: false })

    if (t.length < 2) { setResults([]); setLoading(false); setError(null); setSearched(''); return }
    setLoading(true)
    timer.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('fn_global_search', { p_q: t })
      if (id !== requestId.current) return
      if (error) { setError(error.message); setResults([]) }
      else {
        const hits = visibleHits((data || []) as any, role)
        setError(null); setResults(hits)
        if (hits.length > 0) pushRecent(t)
      }
      setSearched(t)
      setLoading(false)
    }, 200)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, role])

  // Group the flat hit list by kind, preserving the RPC's ordering.
  const groups = useMemo(() => {
    const g: { kind: string; label: string; hits: SearchHit[] }[] = []
    const index: Record<string, number> = {}
    for (const h of results) {
      const meta = SEARCH_KINDS[h.kind]
      if (!meta) continue
      if (index[h.kind] === undefined) { index[h.kind] = g.length; g.push({ kind: h.kind, label: meta.label, hits: [] }) }
      g[index[h.kind]].hits.push(h)
    }
    return g
  }, [results])

  const trimmed = q.trim()

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Search</h1>
          <p>Find an order, customer, session, participant, organization, or inquiry by name.</p>
        </div>
      </div>

      <div className="filters">
        <input
          autoFocus
          type="search"
          aria-label="Search records"
          placeholder="Search records…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 320, maxWidth: 480 }}
        />
      </div>

      {error && <ErrorNote error={error} />}

      {trimmed.length < 2 ? (
        recent.length > 0 ? (
          <div className="card card-pad">
            <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="k-label">Recent searches</div>
              <button className="linkbtn" onClick={clearRecent}>Clear</button>
            </div>
            <div className="chip-row">
              {recent.map((t) => (
                <button key={t} className="btn btn-ghost btn-sm" onClick={() => setQ(t)}>{t}</button>
              ))}
            </div>
          </div>
        ) : (
          <Empty title="Type to search">Enter at least two characters to search across the portal.</Empty>
        )
      ) : loading ? (
        <Spinner label="Searching" />
      ) : groups.length === 0 ? (
        <Empty title="No matches">Nothing matches “{searched || trimmed}”.</Empty>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          <div className="fill-label">{results.length} result{results.length === 1 ? '' : 's'} for “{searched}” — upcoming sessions first.</div>
          {groups.map((g) => (
            <div key={g.kind} className="card">
              <div className="k-label" style={{ padding: '12px 14px 0' }}>{g.label}</div>
              <table>
                <tbody>
                  {g.hits.map((h, i) => (
                    <tr key={`${h.kind}:${h.id}:${i}`} className="clickable">
                      <td>
                        <Link href={SEARCH_KINDS[h.kind].href(h.id)} style={{ fontWeight: 600 }}>
                          {h.title || '(untitled)'}
                        </Link>
                        {h.subtitle && <div className="fill-label">{h.subtitle}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
