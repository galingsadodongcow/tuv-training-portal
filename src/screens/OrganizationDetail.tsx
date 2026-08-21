'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useOrganization, useOrgClients, useClients, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { RecordHeader, RecordSection, KeyVal, Badge } from '../components/record'
import AttachmentsPanel from '../components/AttachmentsPanel'
import { useToast } from '../components/Toast'

const COUNTRIES = ['PH', 'ID']

export default function OrganizationDetail() {
  const params = useParams()
  const id = String(params.id)
  const { profile } = useAuth()
  const toast = useToast()
  const invalidate = useInvalidate()
  const org = useOrganization(id)
  const members = useOrgClients(id)
  const clients = useClients()
  // Live RLS (20260812210000): organization UPDATE + client set-org are allowed for
  // super_admin/coordinator/operations/business_owner/sales (sales row-scoped by RLS).
  const canEdit = ['super_admin', 'coordinator', 'operations', 'business_owner', 'sales'].includes(profile?.role as string)

  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [pick, setPick] = useState('')

  if (org.isLoading) return <Spinner label="Loading organization" />
  if (org.error) return <ErrorNote error={org.error} />
  const o: any = org.data
  if (!o) {
    return (
      <>
        <RecordHeader title="Organization not found" back={{ href: '/clients', label: 'Customers' }} />
        <div className="card"><div className="empty">This organization does not exist or you cannot access it.</div></div>
      </>
    )
  }

  const startEdit = () => { setForm({ name: o.name, industry: o.industry || '', country: o.country, notes: o.notes || '' }); setEditing(true) }
  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required.'); return }
    setBusy(true)
    const { error } = await supabase.from('organization').update({
      name: form.name.trim(), industry: form.industry.trim() || null, country: form.country, notes: form.notes.trim() || null,
    }).eq('org_id', id)
    if (error) toast.error(error.message)
    else { toast.success('Organization saved.'); setEditing(false); invalidate(['organization', 'org_summary', 'org_options']) }
    setBusy(false)
  }

  const assign = async (clientId: string, orgId: string | null) => {
    const { error } = await supabase.from('client').update({ org_id: orgId }).eq('client_id', clientId)
    if (error) toast.error(error.message)
    else { toast.success(orgId ? 'Contact added.' : 'Contact removed.'); invalidate(['org_clients', 'org_summary', 'clients', 'client']) }
  }

  const memberIds = new Set((members.data || []).map((c: any) => c.client_id))
  const available = (clients.data || []).filter((c: any) => !memberIds.has(c.client_id) && !c.deleted_at)

  return (
    <>
      <RecordHeader
        crumbs={[{ href: '/my-work', label: 'My Work' }, { href: '/clients', label: 'Customers' }, { label: o.name }]}
        title={o.name}
        subtitle={[o.industry, o.country].filter(Boolean).join(' · ') || undefined}
        badges={<Badge tone="info">{members.data?.length || 0} contact{(members.data?.length || 0) === 1 ? '' : 's'}</Badge>}
        actions={canEdit && !editing && <button className="btn btn-ghost btn-sm" onClick={startEdit}>Edit</button>}
      />

      {editing ? (
        <div className="card card-pad" style={{ marginBottom: 16, maxWidth: 640 }}>
          <div className="grid" style={{ gridTemplateColumns: '2fr 1fr 1fr' }}>
            <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field"><span>Industry</span><input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} /></label>
            <label className="field"><span>Country</span>
              <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>{COUNTRIES.map((c) => (<option key={c}>{c}</option>))}</select>
            </label>
          </div>
          <label className="field"><span>Notes</span><textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} /></label>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <button className="btn btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        o.notes && (
          <div className="card card-pad" style={{ marginBottom: 16 }}>
            <KeyVal label="Notes">{o.notes}</KeyVal>
          </div>
        )
      )}

      <RecordSection title={`Contacts (${members.data?.length || 0})`}>
        {members.isLoading ? <Spinner /> : (members.data?.length || 0) === 0 ? (
          <div className="card"><div className="empty">No contacts yet. Add one below.</div></div>
        ) : (
          <div className="card">
            <table>
              <thead><tr><th>Company</th><th>Contact</th><th>Email</th><th>Owner</th>{canEdit && <th></th>}</tr></thead>
              <tbody>
                {members.data?.map((c: any) => (
                  <tr key={c.client_id}>
                    <td><Link href={`/clients/${c.client_id}`} style={{ fontWeight: 600 }}>{c.company || c.name}</Link></td>
                    <td className="fill-label">{c.contact || c.name || '—'}</td>
                    <td className="fill-label">{c.email || '—'}</td>
                    <td className="fill-label">{c.salesperson?.name || '—'}</td>
                    {canEdit && <td className="right"><button className="linkbtn" onClick={() => assign(c.client_id, null)}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </RecordSection>

      {canEdit && (
        <div className="card card-pad" style={{ marginTop: 12, maxWidth: 640 }}>
          <div className="k-label" style={{ marginBottom: 8 }}>Add a contact to this organization</div>
          <div className="toolbar">
            <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ minWidth: 280 }}>
              <option value="">Select a client…</option>
              {available.map((c: any) => (
                <option key={c.client_id} value={c.client_id}>{c.company || c.name}{c.email ? ` — ${c.email}` : ''}{c.org_id ? ' (moves from another org)' : ''}</option>
              ))}
            </select>
            <button className="btn btn-sm" disabled={!pick} onClick={() => { assign(pick, id); setPick('') }}>Add</button>
          </div>
        </div>
      )}

      <RecordSection title="Files">
        <div className="card card-pad"><AttachmentsPanel entityType="organization" entityId={id} /></div>
      </RecordSection>
    </>
  )
}
