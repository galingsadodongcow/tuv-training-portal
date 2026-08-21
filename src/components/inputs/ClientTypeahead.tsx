'use client'
import { useEffect, useId, useMemo, useRef, useState, KeyboardEvent } from 'react'

export interface ClientLite { client_id: string; company?: string; name?: string; contact?: string; email?: string }

// A free-text company field that suggests existing clients as you type (#120).
// Unlike Combobox (which forces a choice from a fixed list), the typed text is
// the value — you can log a brand-new company — but picking a suggestion fires
// onPick so the caller can link the client id and inherit its contact/email,
// killing the top source of duplicate customers. Reuses the .combobox styles.
export function ClientTypeahead({
  value, onTextChange, onPick, clients, linked, placeholder, ariaLabel, inputProps,
}: {
  value: string
  onTextChange: (text: string) => void
  onPick: (c: ClientLite) => void
  clients: ClientLite[]
  linked?: boolean
  placeholder?: string
  ariaLabel?: string
  inputProps?: Record<string, any>
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const listId = useId()

  const matches = useMemo(() => {
    const t = value.trim().toLowerCase()
    if (t.length < 2) return []
    return clients
      .filter((c) => c.company?.toLowerCase().includes(t) || c.name?.toLowerCase().includes(t) || c.email?.toLowerCase().includes(t))
      .slice(0, 8)
  }, [value, clients])

  useEffect(() => { setActive(0) }, [value])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const pick = (c: ClientLite) => { onPick(c); setOpen(false) }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { if (open && matches[active]) { e.preventDefault(); pick(matches[active]) } }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false) } }
  }

  const activeId = open && matches.length ? `${listId}-opt-${active}` : undefined
  const { className: extraClass, ...restInput } = inputProps || {}

  return (
    <div className="combobox" ref={wrapRef}>
      <div className="combobox-field">
        <input
          type="text" role="combobox" aria-expanded={open && matches.length > 0} aria-controls={listId}
          aria-activedescendant={activeId} aria-autocomplete="list" aria-label={ariaLabel}
          value={value} placeholder={placeholder}
          className={[extraClass, linked ? 'is-linked' : ''].filter(Boolean).join(' ') || undefined}
          onChange={(e) => { onTextChange(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          {...restInput}
        />
        {linked && <span className="combobox-linked" title="Linked to an existing client">🔗</span>}
      </div>
      {open && matches.length > 0 && (
        <div className="combobox-list" id={listId} role="listbox" aria-label="Existing clients">
          {matches.map((c, i) => (
            <button key={c.client_id} id={`${listId}-opt-${i}`} type="button" role="option" aria-selected={false}
              className={`combobox-item ${i === active ? 'on' : ''}`}
              onMouseEnter={() => setActive(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(c)}>
              <span>{c.company || c.name}</span>
              <span className="combobox-sub">{[c.company && c.name ? c.name : null, c.email].filter(Boolean).join(' · ') || 'existing client'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
