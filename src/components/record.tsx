'use client'
import { ReactNode } from 'react'
import Link from 'next/link'

// Shared building blocks for record detail routes (session, order, and later
// clients and organizations). These give every record page one header shape,
// one tab bar, and one section rhythm, so the workspaces feel like one system.

export function RecordHeader({
  title,
  subtitle,
  badges,
  actions,
  back,
}: {
  title: ReactNode
  subtitle?: ReactNode
  badges?: ReactNode
  actions?: ReactNode
  back?: { href: string; label: string }
}) {
  return (
    <div className="page-head record-head">
      <div>
        {back && (
          <Link className="back-link" href={back.href}>
            ‹ {back.label}
          </Link>
        )}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
        {badges && (
          <div className="chip-row" style={{ marginTop: 10 }}>
            {badges}
          </div>
        )}
      </div>
      {actions && <div className="toolbar record-actions">{actions}</div>}
    </div>
  )
}

// URL-driven tabs. The active tab lives in the query string so a refresh or a
// shared link lands on the same tab.
export function RecordTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: ReactNode }[]
  active: string
  onChange: (key: string) => void
}) {
  return (
    <div className="tabbar" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className={`tab ${active === t.key ? 'tab-on' : ''}`}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function RecordSection({ title, children }: { title?: ReactNode; children: ReactNode }) {
  return (
    <div className="record-section">
      {title && (
        <div className="k-label" style={{ marginBottom: 8 }}>
          {title}
        </div>
      )}
      {children}
    </div>
  )
}

// A labelled key/value cell, for the overview grids.
export function KeyVal({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="k-label">{label}</div>
      <div className="record-kv-value">{children}</div>
    </div>
  )
}

// Generic status badge. Pass a tone class to color it; falls back to neutral.
const TONE_CLASS: Record<string, string> = {
  ok: 'pill-go',
  warn: 'pill-tentative',
  danger: 'pill-nogo',
  info: 'pill-webshop',
  neutral: 'pill-cancelled',
}
export function Badge({ children, tone = 'info' }: { children: ReactNode; tone?: keyof typeof TONE_CLASS }) {
  return <span className={`pill ${TONE_CLASS[tone] || TONE_CLASS.info}`}>{children}</span>
}

// Inline banner for save results and errors inside a record page.
export function RecordNotice({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <div className={`notice ${ok ? 'notice-info' : 'notice-error'}`}>{children}</div>
}
