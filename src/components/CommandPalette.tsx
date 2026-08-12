'use client'
import { useEffect, useMemo, useRef, useState, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { NAV, Role } from '@/lib/roles'
import { SEARCH_KINDS as KIND, visibleHits } from '@/lib/search'

type Entry = { key: string; label: string; sub: string; group: string; go: () => void }

// ⌘K / Ctrl+K jump menu. Filters the navigation, and once you type two letters
// it also searches records by name across the portal.
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const [results, setResults] = useState<any[]>([])
  const router = useRouter()
  const { profile } = useAuth()
  const role = profile?.role as Role | undefined
  const dialogRef = useRef<HTMLDivElement | null>(null)
  // The element focused before the palette opened, so we can restore it on close.
  const restoreFocus = useRef<HTMLElement | null>(null)

  const closePalette = () => {
    setOpen(false)
    const el = restoreFocus.current
    restoreFocus.current = null
    if (el && typeof el.focus === 'function') setTimeout(() => el.focus(), 0)
  }

  const navItems = useMemo(() => NAV.filter((n) => role && n.roles.includes(role)), [role])
  const navMatches = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? navItems.filter((i) => i.label.toLowerCase().includes(t)) : navItems
  }, [navItems, q])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => {
          if (!o) restoreFocus.current = document.activeElement as HTMLElement | null
          return !o
        })
        setQ(''); setActive(0); setResults([])
      } else if (e.key === 'Escape') {
        closePalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => setActive(0), [q])

  // Debounced record search. Two characters minimum. Tolerant of the function
  // not existing yet, in which case it simply returns no records.
  const timer = useRef<any>(null)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    const t = q.trim()
    if (!open || t.length < 2) { setResults([]); return }
    timer.current = setTimeout(async () => {
      const { data, error } = await supabase.rpc('fn_global_search', { p_q: t })
      if (error) setResults([])
      else setResults(visibleHits((data || []) as any, role))
    }, 200)
    return () => timer.current && clearTimeout(timer.current)
  }, [q, open, role])

  const go = (path: string) => { setOpen(false); router.push(path) }

  const entries: Entry[] = useMemo(() => {
    const nav: Entry[] = navMatches.map((it) => ({ key: 'nav:' + it.path, label: it.label, sub: it.path, group: 'Go to', go: () => go(it.path) }))
    const recs: Entry[] = results.map((r: any, i: number) => ({
      key: r.kind + ':' + r.id + ':' + i,
      label: r.title || '(untitled)',
      sub: [KIND[r.kind]?.label, r.subtitle].filter(Boolean).join(' · '),
      group: 'Records',
      go: () => go(KIND[r.kind].href(r.id)),
    }))
    return [...nav, ...recs]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navMatches, results])

  if (!open) return null

  const onInputKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, entries.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); entries[active]?.go() }
    else if (e.key === 'Tab' && dialogRef.current) {
      // Keep Tab focus inside the palette.
      const list = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button, input, [href], [tabindex]:not([tabindex="-1"])')
      ).filter((el) => !el.hasAttribute('disabled'))
      if (list.length === 0) return
      const first = list[0]
      const last = list[list.length - 1]
      const activeEl = document.activeElement as HTMLElement | null
      if (e.shiftKey && activeEl === first) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && activeEl === last) { e.preventDefault(); first.focus() }
    }
  }

  let lastGroup = ''
  const activeId = entries.length > 0 ? `cmdk-opt-${active}` : undefined

  return (
    <div className="cmdk-scrim" onClick={closePalette}>
      <div className="cmdk" ref={dialogRef} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Command menu">
        <input
          autoFocus
          className="cmdk-input"
          placeholder="Jump to a page, or search records…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
          role="combobox"
          aria-expanded={entries.length > 0}
          aria-controls="cmdk-listbox"
          aria-activedescendant={activeId}
          aria-autocomplete="list"
        />
        <div className="cmdk-list" id="cmdk-listbox" role="listbox" aria-label="Results">
          {entries.length === 0 && (
            <div className="cmdk-empty">{q.trim().length >= 2 ? 'No matches' : 'Type to search records.'}</div>
          )}
          {entries.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.key}>
                {header && <div className="cmdk-group">{header}</div>}
                <button
                  id={`cmdk-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  className={`cmdk-item ${i === active ? 'on' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={it.go}
                >
                  <span>{it.label}</span>
                  <span className="cmdk-path">{it.sub}</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="cmdk-foot">
          <kbd>↑</kbd><kbd>↓</kbd> navigate&nbsp;&nbsp;<kbd>↵</kbd> open&nbsp;&nbsp;<kbd>esc</kbd> close
        </div>
      </div>
    </div>
  )
}
