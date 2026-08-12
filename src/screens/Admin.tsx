'use client'
import { useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAllProfiles, useAllSalespeople, useInvalidate } from '../hooks/data'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { Spinner, ErrorNote, Empty } from '../components/ui'
import { ROLE_LABEL, type Role } from '../lib/roles'

const ROLES: Role[] = [
  'super_admin', 'operations', 'business_owner', 'sales',
  'coordinator', 'sales_manager', 'management', 'auditor',
]
// Roles that resolve order visibility through a linked salesperson record.
const SELLING_ROLES = ['sales', 'sales_manager']

export default function Admin() {
  const { profile } = useAuth()
  const profiles = useAllProfiles()
  const sales = useAllSalespeople()
  const invalidate = useInvalidate()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<'users' | 'teams'>('users')
  const [busy, setBusy] = useState<string | null>(null)

  const isAdmin = profile?.role === 'super_admin'

  const setRole = async (u: any, role: string) => {
    if (role === u.role) return
    const label = ROLE_LABEL[role as Role] || role
    const grantsAdmin = role === 'super_admin' && u.role !== 'super_admin'
    const removesAdmin = u.role === 'super_admin' && role !== 'super_admin'
    const clearsLink = !SELLING_ROLES.includes(role) && !!u.sales_id
    const body =
      `Change ${u.full_name || 'this user'}'s role to ${label}.` +
      (grantsAdmin ? ' This grants full super admin access to every part of the portal.' : '') +
      (removesAdmin ? ' This removes their super admin access.' : '') +
      (clearsLink ? ' Their salesperson link will be cleared.' : '')
    const res = await confirm({
      title: 'Change this user’s role?',
      body,
      confirmLabel: 'Change role',
      tone: 'danger',
      reason: 'optional',
    })
    // The select is bound to u.role, so on cancel React re-renders it back to
    // the current value on its own — nothing to revert manually.
    if (!res.ok) return
    setBusy(u.user_id)
    // Moving a user off the sales role clears the stale salesperson link in the
    // same write, so order visibility does not resolve against a dead pointer.
    const patch: Record<string, any> = { role }
    if (!SELLING_ROLES.includes(role)) patch.sales_id = null
    const { error } = await supabase.from('profiles').update(patch).eq('user_id', u.user_id)
    setBusy(null)
    if (error) toast.error(error.message)
    else { invalidate(['profiles_all']); toast.success('Role updated.') }
  }

  const setLink = async (userId: string, salesId: string) => {
    setBusy(userId)
    const { error } = await supabase.from('profiles').update({ sales_id: salesId || null }).eq('user_id', userId)
    setBusy(null)
    if (error) toast.error(error.message)
    else { invalidate(['profiles_all']); toast.success('Salesperson link updated.') }
  }

  const activeSales = useMemo(() => (sales.data || []).filter((s: any) => s.active), [sales.data])

  const patchSales = async (salesId: string, patch: Record<string, any>) => {
    setBusy(salesId)
    const { error } = await supabase.from('salesperson').update(patch).eq('sales_id', salesId)
    setBusy(null)
    if (error) toast.error(error.message)
    else { invalidate(['salespeople_all', 'salespeople', 'profiles_all']); toast.success('Saved.') }
  }

  const [form, setForm] = useState({ name: '', code: '', team: '', region: '' })
  const addSales = async () => {
    if (!form.name.trim()) return
    setBusy('new')
    const { error } = await supabase.from('salesperson').insert({
      name: form.name.trim(),
      code: form.code.trim() || null,
      team: form.team.trim() || null,
      region: form.region.trim() || null,
    })
    setBusy(null)
    if (error) toast.error(error.message)
    else { setForm({ name: '', code: '', team: '', region: '' }); invalidate(['salespeople_all', 'salespeople']); toast.success('Salesperson added.') }
  }

  if (!isAdmin) {
    return (
      <>
        <div className="page-head"><div><h1>Users and access</h1></div></div>
        <Empty title="Super admins only">This console is limited to super administrators.</Empty>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users and access</h1>
          <p>Assign roles, link people to a salesperson record, and manage the team and region used for order visibility.</p>
        </div>
        <div className="seg">
          <button className={`seg-btn ${tab === 'users' ? 'on' : ''}`} onClick={() => setTab('users')}>Users</button>
          <button className={`seg-btn ${tab === 'teams' ? 'on' : ''}`} onClick={() => setTab('teams')}>Salespeople</button>
        </div>
      </div>

      {tab === 'users' && (
        profiles.isLoading ? <Spinner label="Loading users" /> : profiles.error ? <ErrorNote error={profiles.error} /> : (
          <>
            <div className="notice notice-info" style={{ marginBottom: 14 }}>
              New sign-ins appear here once a person authenticates. Set each person's role, and link the sales role to a
              salesperson so order visibility and pipeline ownership resolve correctly.
            </div>
            <div className="card">
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Linked salesperson</th><th>Team / region</th></tr></thead>
                <tbody>
                  {(profiles.data || []).length === 0 && <tr><td colSpan={4}><div className="empty">No users yet.</div></td></tr>}
                  {(profiles.data || []).map((u: any) => (
                    <tr key={u.user_id} aria-busy={busy === u.user_id} style={{ opacity: busy === u.user_id ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600 }}>{u.full_name || '—'}{u.user_id === profile?.user_id && <span className="fill-label"> · you</span>}</td>
                      <td>
                        <select aria-label={`Role for ${u.full_name || 'user'}`} value={u.role} disabled={u.user_id === profile?.user_id || busy === u.user_id} onChange={(e) => setRole(u, e.target.value)}>
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                        </select>
                      </td>
                      <td>
                        <select aria-label={`Linked salesperson for ${u.full_name || 'user'}`} value={u.sales_id || ''} disabled={!SELLING_ROLES.includes(u.role)} onChange={(e) => setLink(u.user_id, e.target.value)}>
                          <option value="">— none —</option>
                          {activeSales.map((s: any) => <option key={s.sales_id} value={s.sales_id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                        </select>
                      </td>
                      <td className="fill-label">{u.salesperson ? `${u.salesperson.team || '—'} / ${u.salesperson.region || '—'}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}

      {tab === 'teams' && (
        sales.isLoading ? <Spinner label="Loading salespeople" /> : sales.error ? <ErrorNote error={sales.error} /> : (
          <>
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="k-label" style={{ marginBottom: 8 }}>Add a salesperson</div>
              <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
                <input aria-label="New salesperson name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input aria-label="New salesperson code" placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={{ maxWidth: 120 }} />
                <input aria-label="New salesperson team" placeholder="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} style={{ maxWidth: 160 }} />
                <input aria-label="New salesperson region" placeholder="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={{ maxWidth: 160 }} />
                <button className="btn btn-sm" disabled={busy === 'new' || !form.name.trim()} onClick={addSales}>Add</button>
              </div>
            </div>
            <div className="card">
              <table>
                <thead><tr><th>Name</th><th>Code</th><th>Team</th><th>Region</th><th>Supervisor</th><th>Active</th></tr></thead>
                <tbody>
                  {(sales.data || []).length === 0 && <tr><td colSpan={6}><div className="empty">No salespeople yet.</div></td></tr>}
                  {(sales.data || []).map((s: any) => (
                    <tr key={s.sales_id} aria-busy={busy === s.sales_id} style={{ opacity: busy === s.sales_id ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td className="fill-label">{s.code || '—'}</td>
                      <td>
                        <input aria-label={`Team for ${s.name}`} defaultValue={s.team || ''} placeholder="—" style={{ maxWidth: 140 }}
                          onBlur={(e) => e.target.value !== (s.team || '') && patchSales(s.sales_id, { team: e.target.value.trim() || null })} />
                      </td>
                      <td>
                        <input aria-label={`Region for ${s.name}`} defaultValue={s.region || ''} placeholder="—" style={{ maxWidth: 140 }}
                          onBlur={(e) => e.target.value !== (s.region || '') && patchSales(s.sales_id, { region: e.target.value.trim() || null })} />
                      </td>
                      <td>
                        <input aria-label={`Supervisor: ${s.name}`} type="checkbox" checked={!!s.is_supervisor} onChange={(e) => patchSales(s.sales_id, { is_supervisor: e.target.checked })} />
                      </td>
                      <td>
                        <input aria-label={`Active: ${s.name}`} type="checkbox" checked={!!s.active} onChange={(e) => patchSales(s.sales_id, { active: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </>
  )
}
