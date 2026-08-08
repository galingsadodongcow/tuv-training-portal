'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useOrgSummary, useInvalidate } from '../hooks/data'
import { TableSkeleton } from '../components/Skeleton'
import { ErrorNote } from '../components/ui'
import { useToast } from '../components/Toast'
import { num } from '../lib/format'

const COUNTRIES = ['PH', 'ID']
const emptyForm = { name: '', industry: '', country: 'PH' }

export default function Organizations() {
  const router = useRouter()
  const { profile } = useAuth()
  const orgs = useOrgSummary()
  const invalidate = useInvalidate()
  const toast = useToast()
  const canEdit = ['super_admin', 'sales'].includes(profile?.role as string)

  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<any>(emptyForm)
  const [busy, setBusy] = useState(false)
  const set = (k: string) => (e: any) => setForm((f: any) => ({ ...f, [k]: e.target.value }))

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase()
    const list = orgs.data || []
    if (!t) return list
    return list.filter((o: any) => o.name?.toLowerCase().includes(t) || o.industry?.toLowerCase().includes(t))
  }, [orgs.data, q])

  const create = async () => {
    if (!form.name.trim()) { toast.error('Name is required.'); return }
    setBusy(true)
    const { data, error } = await supabase.from('organization')
      .insert({ name: form.name.trim(), industry: form.industry.trim() || null, country: form.country })
      .select('org_id').single()
    if (error) toast.error(error.message)
    else {
      toast.success('Organization added.')
      setForm(emptyForm); setCreating(false); invalidate(['org_summary', 'org_options'])
      if (data?.org_id) router.push(`/organizations/${data.org_id}`)
    }
    setBusy(false)
  }

  if (orgs.isLoading) return <TableSkeleton rows={6} cols={5} />
  if (orgs.error) return <ErrorNote error={orgs.error} />

  const total = (orgs.data || []).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Organizations</h1>
          <p>Parent accounts that group the contacts from one company. {total} on record.</p>
        </div>
        {canEdit && (
          <div className="toolbar">
            <button className="btn" onClick={() => setCreating((c) => !c)}>{creating ? 'Close' : '+ New organization'}</button>
          </div>
        )}
      </div>

      {creating && (
        <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 640 }}>
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <label className="field"><span>Name</span><input value={form.name} onChange={set('name')} /></label>
            <label className="field"><span>Industry</span><input value={form.industry} onChange={set('industry')} /></label>
            <label className="field"><span>Country</span>
              <select value={form.country} onChange={set('country')}>{COUNTRIES.map((c) => (<option key={c}>{c}</option>))}</select>
            </label>
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={create} disabled={busy}>{busy ? 'Adding…' : 'Add organization'}</button>
          </div>
        </div>
      )}

      <div className="filters">
        <input placeholder="Search organizations…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">No organizations yet. Create one, then assign contacts to it from the client record.</div>
        ) : (
          <table>
            <thead><tr><th>Name</th><th>Industry</th><th>Country</th><th className="right">Contacts</th><th className="right">Orders</th><th className="right">Seats</th></tr></thead>
            <tbody>
              {rows.map((o: any) => (
                <tr key={o.org_id} style={{ cursor: 'pointer' }} onClick={() => router.push(`/organizations/${o.org_id}`)}>
                  <td style={{ fontWeight: 600 }}>{o.name}</td>
                  <td className="fill-label">{o.industry || '—'}</td>
                  <td className="fill-label">{o.country}</td>
                  <td className="right">{num(o.client_count)}</td>
                  <td className="right">{num(o.order_count)}</td>
                  <td className="right">{num(o.seat_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
