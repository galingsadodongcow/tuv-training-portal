'use client'
import { useEffect, useId, useMemo, useRef, useState, KeyboardEvent } from 'react'

export interface ComboOption { value: string; label: string; sub?: string }

// A single-select typeahead (combobox) — the input-level primitive the ⌘K menu
// had inline but no form could reuse (#140). Controlled: pass value + onChange.
// Filters options as you type, full keyboard support (↑/↓/Enter/Esc), outside-
// click + blur revert, optional clear. ARIA combobox/listbox wired the same way
// as CommandPalette so screen readers announce the active option.
export function Combobox({
  value, onChange, options, placeholder, ariaLabel, allowClear = true, emptyText = 'No matches', disabled,
}: {
  value: string
  onChange: (value: string) => void
  options: ComboOption[]
  placeholder?: string
  ariaLabel?: string
  allowClear?: boolean
  emptyText?: string
  disabled?: boolean
}) {
  const selectedLabel = useMemo(() => options.find((o) => o.value === value)?.label ?? '', [options, value])
  const [open, setOpen] = useState(false)
  const [text, setText] = useState(selectedLabel)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listId = useId()

  // Reflect an externally-changed value (e.g. a form reset) into the input.
  useEffect(() => { setText(selectedLabel) }, [selectedLabel])

  // Close on any click outside the component, reverting unconfirmed typing.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) { setOpen(false); setText(selectedLabel) }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, selectedLabel])

  const filtered = useMemo(() => {
    const t = text.trim().toLowerCase()
    if (!t || text === selectedLabel) return options
    return options.filter((o) => o.label.toLowerCase().includes(t) || o.sub?.toLowerCase().includes(t))
  }, [text, options, selectedLabel])

  useEffect(() => { setActive(0) }, [text, open])

  const choose = (opt: ComboOption) => { onChange(opt.value); setText(opt.label); setOpen(false) }
  const clear = () => { onChange(''); setText(''); setOpen(true); inputRef.current?.focus() }

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { if (open && filtered[active]) { e.preventDefault(); choose(filtered[active]) } }
    else if (e.key === 'Escape') { if (open) { e.preventDefault(); setOpen(false); setText(selectedLabel) } }
  }

  const activeId = open && filtered.length > 0 ? `${listId}-opt-${active}` : undefined

  return (
    <div className="combobox" ref={wrapRef}>
      <div className="combobox-field">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          aria-label={ariaLabel}
          disabled={disabled}
          value={text}
          placeholder={placeholder}
          onChange={(e) => { setText(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
        />
        {allowClear && value && !disabled && (
          <button type="button" className="combobox-clear" aria-label="Clear selection" onClick={clear}>×</button>
        )}
      </div>
      {open && (
        <div className="combobox-list" id={listId} role="listbox" aria-label={ariaLabel}>
          {filtered.length === 0 ? (
            <div className="combobox-empty">{emptyText}</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value}
                id={`${listId}-opt-${i}`}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={`combobox-item ${i === active ? 'on' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
              >
                <span>{o.label}</span>
                {o.sub && <span className="combobox-sub">{o.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
