'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useDiscountRules, useCourses, useInvalidate } from '../hooks/data'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { Spinner, ErrorNote } from '../components/ui'

const TYPES = ['', 'Professional', 'PersCert']
const COUNTRIES = ['', 'PH', 'ID']

const blank = { label: '', course_id: '', training_type: '', country: '', min_seats: '1', discount_pct: '', discount_amount: '', valid_from: '', valid_to: '' }

export default function PricingRules() {
  const { profile } = useAuth()
  const rules = useDiscountRules()
  const courses = useCourses()
  const invalidate = useInvalidate()
  const toast = useToast()
  const confirm = useConfirm()
  const canManage = ['operations', 'business_owner', 'super_admin'].includes(profile?.role as string)
  const [form, setForm] = useState<any>(blank)
  const [busy, setBusy] = useState<string | null>(null)
  const [show, setShow] = useState(false)

  const add = async () => {
    if (!form.label.trim()) { toast.error('Give the rule a label.'); return }
    if (form.discount_pct === '' && form.discount_amount === '') { toast.error('Set a percentage or a fixed amount.'); return }
    setBusy('new')
    const { error } = await supabase.from('discount_rule').insert({
      label: form.label.trim(),
      course_id: form.course_id || null,
      training_type: form.training_type || null,
      country: form.country || null,
      min_seats: Math.max(1, Number(form.min_seats) || 1),
      discount_pct: form.discount_pct === '' ? null : Number(form.discount_pct),
      discount_amount: form.discount_amount === '' ? null : Number(form.discount_amount),
    })
    setBusy(null)
    if (error) toast.error(error.message)
    else { setForm(blank); setShow(false); invalidate(['discount_rules']); toast.success('Rule added.') }
  }

  const toggle = async (id: string, active: boolean) => {
    setBusy(id)
    const { error } = await supabase.from('discount_rule').update({ active }).eq('rule_id', id)
    setBusy(null)
    if (error) toast.error(error.message)
    else { invalidate(['discount_rules']); toast.success('Updated.') }
  }

  const remove = async (id: string) => {
    const res = await confirm({ title: 'Delete this pricing rule?', confirmLabel: 'Delete', tone: 'danger' })
    if (!res.ok) return
    setBusy(id)
    const { error } = await supabase.from('discount_rule').delete().eq('rule_id', id)
    setBusy(null)
    if (error) toast.error(error.message)
    else { invalidate(['discount_rules']); toast.success('Rule removed.') }
  }

  const effect = (r: any) => r.discount_pct != null ? `${r.discount_pct}%` : r.discount_amount != null ? `−${r.discount_amount}` : '—'

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Pricing rules</h1>
          <p>Volume and type-based discount rules. Quotes and new orders surface the best applicable rule as a suggestion.</p>
        </div>
        {canManage && <button className="btn btn-sm" onClick={() => setShow((v) => !v)}>{show ? 'Cancel' : 'New rule'}</button>}
      </div>

      {show && canManage && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label className="fill-label">Label
              <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Volume 10+" />
            </label>
            <label className="fill-label">Course
              <select value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
                <option value="">All courses</option>
                {(courses.data || []).map((c: any) => <option key={c.course_id} value={c.course_id}>{c.course_name}</option>)}
              </select>
            </label>
            <label className="fill-label">Type
              <select value={form.training_type} onChange={(e) => setForm({ ...form, training_type: e.target.value })}>
                {TYPES.map((t) => <option key={t} value={t}>{t || 'All types'}</option>)}
              </select>
            </label>
            <label className="fill-label">Country
              <select value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}>
                {COUNTRIES.map((c) => <option key={c} value={c}>{c || 'All countries'}</option>)}
              </select>
            </label>
            <label className="fill-label">Min seats
              <input type="number" min={1} value={form.min_seats} onChange={(e) => setForm({ ...form, min_seats: e.target.value })} />
            </label>
            <label className="fill-label">Discount %
              <input type="number" min={0} max={100} value={form.discount_pct} onChange={(e) => setForm({ ...form, discount_pct: e.target.value, discount_amount: '' })} />
            </label>
            <label className="fill-label">or Fixed amount
              <input type="number" min={0} value={form.discount_amount} onChange={(e) => setForm({ ...form, discount_amount: e.target.value, discount_pct: '' })} />
            </label>
          </div>
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-sm" disabled={busy === 'new'} onClick={add}>Save rule</button>
          </div>
        </div>
      )}

      {rules.isLoading ? <Spinner label="Loading rules" /> : rules.error ? <ErrorNote error={rules.error} /> : (
        <div className="card">
          {(rules.data?.length || 0) === 0 ? <div className="empty">No pricing rules yet.</div> : (
            <table>
              <thead><tr><th>Rule</th><th>Scope</th><th className="right">Min seats</th><th className="right">Discount</th><th>Status</th>{canManage && <th></th>}</tr></thead>
              <tbody>
                {(rules.data || []).map((r: any) => (
                  <tr key={r.rule_id} style={{ opacity: busy === r.rule_id ? 0.5 : r.active ? 1 : 0.6 }}>
                    <td style={{ fontWeight: 600 }}>{r.label}</td>
                    <td className="fill-label">
                      {r.course?.course_name || 'All courses'}
                      {r.training_type ? ` · ${r.training_type}` : ''}
                      {r.country ? ` · ${r.country}` : ''}
                    </td>
                    <td className="right">{r.min_seats}</td>
                    <td className="right">{effect(r)}</td>
                    <td>{r.active ? <span className="pill pill-inside">Active</span> : <span className="pill">Off</span>}</td>
                    {canManage && (
                      <td className="right" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn btn-ghost btn-sm" onClick={() => toggle(r.rule_id, !r.active)}>{r.active ? 'Disable' : 'Enable'}</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => remove(r.rule_id)}>Delete</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}
