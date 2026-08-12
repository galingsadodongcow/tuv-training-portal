'use client'
import { useMemo, useState } from 'react'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import { useAuth } from '../hooks/useAuth'
import { useSavedViews, useUpsertSavedView, useDeleteSavedView } from '../hooks/data'
import { useConfirm } from './Confirm'
import { useToast } from './Toast'

// SV01 — saved views for a filterable surface (Orders / Calendar / fulfilment
// queue). The screen already keeps its filter state in the URL; a "view" is just
// the subset of those params that define it. Applying a view rewrites only those
// params (leaving e.g. the CRM shell's ?tab= intact); saving captures the ones
// currently set. Role-default views (shared_role, seeded server-side) show with a
// ★ and are read-only; a user's own views can be deleted. RLS scopes both.
export default function SavedViews({ surface, paramKeys }: { surface: string; paramKeys: string[] }) {
  const { profile } = useAuth()
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const confirm = useConfirm()
  const toast = useToast()

  const viewsQ = useSavedViews(surface)
  const upsert = useUpsertSavedView()
  const del = useDeleteSavedView()

  const [saving, setSaving] = useState(false)
  const [name, setName] = useState('')

  const views: any[] = viewsQ.data || []
  const isOwn = (v: any) => v.owner_id === profile?.user_id && !v.shared_role

  // A view is exactly the surface's paramKeys that are present in the URL. We key
  // on presence, not on any "all" sentinel — some screens delete a param when it
  // returns to its default (so an absent key already means default), while others
  // carry an explicit value like month=all that must be preserved verbatim.
  const current = useMemo(() => {
    const c: Record<string, string> = {}
    for (const k of paramKeys) {
      const val = params.get(k)
      if (val != null && val !== '') c[k] = val
    }
    return c
  }, [params, paramKeys])
  const currentSig = JSON.stringify(current)
  const configSig = (cfg: any) => {
    const c: Record<string, string> = {}
    for (const k of paramKeys) if (cfg?.[k] != null && cfg[k] !== '') c[k] = String(cfg[k])
    return JSON.stringify(c)
  }
  const hasFilters = Object.keys(current).length > 0

  const apply = (v: any) => {
    const n = new URLSearchParams(params.toString())
    for (const k of paramKeys) n.delete(k)
    for (const k of paramKeys) if (v.config?.[k] != null && v.config[k] !== '') n.set(k, String(v.config[k]))
    router.replace(`${pathname}?${n.toString()}`, { scroll: false })
  }

  const save = async () => {
    const nm = name.trim()
    if (!nm || !profile?.user_id) return
    try {
      await upsert.mutateAsync({ owner_id: profile.user_id, surface, name: nm, config: current })
      toast.success(`View “${nm}” saved.`)
      setName(''); setSaving(false)
    } catch (e: any) {
      toast.error(e?.message || 'Could not save the view.')
    }
  }

  const remove = async (v: any) => {
    const res = await confirm({ title: `Delete the view “${v.name}”?`, confirmLabel: 'Delete', tone: 'danger' })
    if (!res.ok) return
    try {
      await del.mutateAsync(v.view_id)
      toast.success('View deleted.')
    } catch (e: any) {
      toast.error(e?.message || 'Could not delete the view.')
    }
  }

  return (
    <div className="saved-views" role="group" aria-label="Saved views">
      {views.map((v) => {
        const active = configSig(v.config) === currentSig
        return (
          <span key={v.view_id} className={`sv-chip${active ? ' sv-active' : ''}`}>
            <button type="button" className="sv-apply" aria-pressed={active} onClick={() => apply(v)}
              title={v.shared_role ? 'Default view' : 'Your saved view'}>
              {v.shared_role ? '★ ' : ''}{v.name}
            </button>
            {isOwn(v) && (
              <button type="button" className="sv-del" aria-label={`Delete view ${v.name}`} onClick={() => remove(v)}>×</button>
            )}
          </span>
        )
      })}

      {saving ? (
        <span className="sv-chip sv-saving">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name this view"
            placeholder="Name this view"
            onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setSaving(false); setName('') } }} />
          <button type="button" className="btn btn-sm" onClick={save} disabled={!name.trim() || upsert.isPending}>Save</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSaving(false); setName('') }}>Cancel</button>
        </span>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSaving(true)}
          disabled={!hasFilters || !profile?.user_id}
          title={hasFilters ? 'Save the current filters as a view' : 'Set a filter first, then save it as a view'}>
          ★ Save this view
        </button>
      )}
    </div>
  )
}
