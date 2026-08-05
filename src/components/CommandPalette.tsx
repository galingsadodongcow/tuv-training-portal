'use client'
import { useEffect, useMemo, useState, KeyboardEvent } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { NAV, Role } from '@/lib/roles'

// ⌘K / Ctrl+K jump-to menu over the role-filtered navigation.
export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const router = useRouter()
  const { profile } = useAuth()
  const role = profile?.role as Role | undefined

  const items = useMemo(() => NAV.filter((n) => role && n.roles.includes(role)), [role])
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t ? items.filter((i) => i.label.toLowerCase().includes(t)) : items
  }, [items, q])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
        setQ('')
        setActive(0)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => setActive(0), [q])

  if (!open) return null

  const go = (path: string) => {
    setOpen(false)
    router.push(path)
  }
  const onInputKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const it = filtered[active]
      if (it) go(it.path)
    }
  }

  return (
    <div className="cmdk-scrim" onClick={() => setOpen(false)}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command menu">
        <input
          autoFocus
          className="cmdk-input"
          placeholder="Jump to…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onInputKey}
        />
        <div className="cmdk-list">
          {filtered.length === 0 && <div className="cmdk-empty">No matches</div>}
          {filtered.map((it, i) => (
            <button
              key={it.path}
              className={`cmdk-item ${i === active ? 'on' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(it.path)}
            >
              <span>{it.label}</span>
              <span className="cmdk-path">{it.path}</span>
            </button>
          ))}
        </div>
        <div className="cmdk-foot">
          <kbd>↑</kbd><kbd>↓</kbd> navigate&nbsp;&nbsp;<kbd>↵</kbd> open&nbsp;&nbsp;<kbd>esc</kbd> close
        </div>
      </div>
    </div>
  )
}
