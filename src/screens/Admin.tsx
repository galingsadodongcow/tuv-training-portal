'use client'
import { useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import {
  useAllSalespeople, useTeamMembers, useGrantableRoles,
  useGrantMemberRole, useLinkMemberSalesperson, useUpsertTeamMember,
} from '../hooks/data'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { Spinner, ErrorNote, Empty } from '../components/ui'
import { ROLE_LABEL, type Role } from '../lib/roles'

// Roles that resolve order visibility through a linked salesperson record.
const SELLING_ROLES = ['sales', 'sales_manager']

// Users and access. Previously super-admin only, which left operations and
// sales supervisors unable to see — let alone build — their own teams. It is now
// capability-driven: the database decides who may manage whom
// (fn_can_manage_member) and which roles each delegator may hand out
// (fn_member_grantable_roles), and this screen renders that answer. A supervisor
// sees only their own team and can only grant `sales`; operations cannot touch a
// super admin; nobody can change their own role. See migration 20260814060000.
export default function Admin() {
  const { profile } = useAuth()
  const members = useTeamMembers()
  const grantable = useGrantableRoles()
  const sales = useAllSalespeople()
  const grantRole = useGrantMemberRole()
  const linkSales = useLinkMemberSalesperson()
  const upsertMember = useUpsertTeamMember()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState<'users' | 'teams'>('users')
  const [busy, setBusy] = useState<string | null>(null)

  const grantableRoles: Role[] = useMemo(() => (grantable.data || []) as Role[], [grantable.data])
  // No grantable roles and no roster rights means this console has nothing to
  // offer — the nav already hides it, this is the direct-URL case.
  const canDelegate = grantableRoles.length > 0
  const isAdminish = ['super_admin', 'operations'].includes(profile?.role as string)

  const setRole = async (u: any, role: string) => {
    if (role === u.role) return
    const label = ROLE_LABEL[role as Role] || role
    const grantsAdmin = role === 'super_admin'
    const clearsLink = !SELLING_ROLES.includes(role) && !!u.sales_id
    const body =
      `Change ${u.full_name || 'this user'}'s role to ${label}.` +
      (grantsAdmin ? ' This grants full super admin access to every part of the portal.' : '') +
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
    try {
      await grantRole.mutateAsync({ userId: u.user_id, role, reason: res.reason?.trim() || undefined })
      toast.success('Role updated.')
    } catch (e: any) {
      toast.error(e?.message || 'Could not change that role.')
    }
    setBusy(null)
  }

  const setLink = async (u: any, salesId: string) => {
    setBusy(u.user_id)
    try {
      await linkSales.mutateAsync({ userId: u.user_id, salesId: salesId || null })
      toast.success('Salesperson link updated.')
    } catch (e: any) {
      toast.error(e?.message || 'Could not update that link.')
    }
    setBusy(null)
  }

  const activeSales = useMemo(() => (sales.data || []).filter((s: any) => s.active), [sales.data])

  const patchSales = async (s: any, patch: Record<string, any>) => {
    setBusy(s.sales_id)
    try {
      await upsertMember.mutateAsync({
        salesId: s.sales_id,
        name: patch.name ?? s.name,
        code: patch.code ?? s.code,
        team: patch.team !== undefined ? patch.team : s.team,
        region: patch.region !== undefined ? patch.region : s.region,
        active: patch.active !== undefined ? patch.active : s.active,
      })
      toast.success('Saved.')
    } catch (e: any) {
      toast.error(e?.message || 'Could not save that change.')
    }
    setBusy(null)
  }

  const [form, setForm] = useState({ name: '', code: '', team: '', region: '' })
  const addSales = async () => {
    if (!form.name.trim()) return
    setBusy('new')
    try {
      await upsertMember.mutateAsync({
        name: form.name.trim(),
        code: form.code.trim() || null,
        team: form.team.trim() || null,
        region: form.region.trim() || null,
      })
      setForm({ name: '', code: '', team: '', region: '' })
      toast.success('Team member added.')
    } catch (e: any) {
      toast.error(e?.message || 'Could not add that member.')
    }
    setBusy(null)
  }

  if (!canDelegate && !grantable.isLoading) {
    return (
      <>
        <div className="page-head"><div><h1>Users and access</h1></div></div>
        <Empty title="Not available for your role">
          Managing roles and team membership is limited to super admins, operations and sales supervisors.
        </Empty>
      </>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Users and access</h1>
          <p>
            Assign roles, link people to a salesperson record, and manage the team and region used for order
            visibility. You can only see and change the people you are allowed to manage.
          </p>
        </div>
        <div className="seg">
          <button className={`seg-btn ${tab === 'users' ? 'on' : ''}`} onClick={() => setTab('users')}>Users</button>
          <button className={`seg-btn ${tab === 'teams' ? 'on' : ''}`} onClick={() => setTab('teams')}>Salespeople</button>
        </div>
      </div>

      {tab === 'users' && (
        members.isLoading ? <Spinner label="Loading users" /> : members.error ? <ErrorNote error={members.error} /> : (
          <>
            <div className="notice notice-info" style={{ marginBottom: 14 }}>
              People appear here once they have signed in at least once — signing in is what creates their profile.
              Set each person&apos;s role, and link the sales roles to a salesperson record so order visibility and
              pipeline ownership resolve correctly.
            </div>
            <div className="card">
              <div className="scroll-x">
              <table>
                <thead><tr><th>Name</th><th>Role</th><th>Linked salesperson</th><th>Team / region</th></tr></thead>
                <tbody>
                  {(members.data || []).length === 0 && <tr><td colSpan={4}><div className="empty">No users yet.</div></td></tr>}
                  {(members.data || []).map((u: any) => {
                    // A row you may not manage still shows for context (your own
                    // row, or a teammate) but every control on it is read-only.
                    const editable = u.manageable && !u.is_self
                    return (
                      <tr key={u.user_id} aria-busy={busy === u.user_id} style={{ opacity: busy === u.user_id ? 0.5 : 1 }}>
                        <td style={{ fontWeight: 600 }}>
                          {u.full_name || '—'}{u.is_self && <span className="fill-label"> · you</span>}
                        </td>
                        <td>
                          {editable ? (
                            <select aria-label={`Role for ${u.full_name || 'user'}`} value={u.role}
                              disabled={busy === u.user_id}
                              onChange={(e) => setRole(u, e.target.value)}>
                              {/* The current role is always listed so the select
                                  shows the truth even when it is not grantable. */}
                              {!grantableRoles.includes(u.role) && (
                                <option value={u.role}>{ROLE_LABEL[u.role as Role] || u.role}</option>
                              )}
                              {grantableRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                            </select>
                          ) : (
                            <span className="fill-label">{ROLE_LABEL[u.role as Role] || u.role}</span>
                          )}
                        </td>
                        <td>
                          {editable && SELLING_ROLES.includes(u.role) ? (
                            <select aria-label={`Linked salesperson for ${u.full_name || 'user'}`} value={u.sales_id || ''}
                              disabled={busy === u.user_id}
                              onChange={(e) => setLink(u, e.target.value)}>
                              <option value="">— none —</option>
                              {activeSales.map((s: any) => <option key={s.sales_id} value={s.sales_id}>{s.name}{s.code ? ` (${s.code})` : ''}</option>)}
                            </select>
                          ) : (
                            <span className="fill-label">{u.sales_name || '—'}</span>
                          )}
                        </td>
                        <td className="fill-label">{u.team || '—'} / {u.region || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )
      )}

      {tab === 'teams' && (
        sales.isLoading ? <Spinner label="Loading salespeople" /> : sales.error ? <ErrorNote error={sales.error} /> : (
          <>
            <div className="card card-pad" style={{ marginBottom: 16 }}>
              <div className="k-label" style={{ marginBottom: 8 }}>Add a team member</div>
              {!isAdminish && (
                <p className="fill-label" style={{ marginTop: -4, marginBottom: 8 }}>
                  New members join your own team and region.
                </p>
              )}
              <div className="toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
                <input aria-label="New salesperson name" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                <input aria-label="New salesperson code" placeholder="Code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} style={{ maxWidth: 120 }} />
                {isAdminish && (
                  <>
                    <input aria-label="New salesperson team" placeholder="Team" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} style={{ maxWidth: 160 }} />
                    <input aria-label="New salesperson region" placeholder="Region" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} style={{ maxWidth: 160 }} />
                  </>
                )}
                <button className="btn btn-sm" disabled={busy === 'new' || !form.name.trim()} onClick={addSales}>Add</button>
              </div>
            </div>
            <div className="card">
              <div className="scroll-x">
              <table>
                <thead><tr><th>Name</th><th>Code</th><th>Team</th><th>Region</th><th>Active</th></tr></thead>
                <tbody>
                  {(sales.data || []).length === 0 && <tr><td colSpan={5}><div className="empty">No salespeople yet.</div></td></tr>}
                  {(sales.data || []).map((s: any) => (
                    <tr key={s.sales_id} aria-busy={busy === s.sales_id} style={{ opacity: busy === s.sales_id ? 0.5 : 1 }}>
                      <td style={{ fontWeight: 600 }}>{s.name}</td>
                      <td className="fill-label">{s.code || '—'}</td>
                      <td>
                        {isAdminish ? (
                          <input aria-label={`Team for ${s.name}`} defaultValue={s.team || ''} placeholder="—" style={{ maxWidth: 140 }}
                            onBlur={(e) => e.target.value !== (s.team || '') && patchSales(s, { team: e.target.value.trim() || null })} />
                        ) : <span className="fill-label">{s.team || '—'}</span>}
                      </td>
                      <td>
                        {isAdminish ? (
                          <input aria-label={`Region for ${s.name}`} defaultValue={s.region || ''} placeholder="—" style={{ maxWidth: 140 }}
                            onBlur={(e) => e.target.value !== (s.region || '') && patchSales(s, { region: e.target.value.trim() || null })} />
                        ) : <span className="fill-label">{s.region || '—'}</span>}
                      </td>
                      <td>
                        <input aria-label={`Active: ${s.name}`} type="checkbox" checked={!!s.active}
                          onChange={(e) => patchSales(s, { active: e.target.checked })} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>
          </>
        )
      )}
    </>
  )
}
