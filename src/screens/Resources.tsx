'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTrainers, useVenues, useTrainerLoad, useUnstaffed, useInvalidate } from '../hooks/data'
import { ErrorNote } from '../components/ui'
import { useToast } from '../components/Toast'
import { useConfirm } from '../components/Confirm'
import { TableSkeleton } from '../components/Skeleton'
import { shortDate } from '../lib/format'
import Link from 'next/link'
import TrainerManage from '../components/TrainerManage'

const T_TYPES = ['Internal', 'Associate', 'External']
const V_TYPES = ['Training Room', 'Hotel', 'Client Site', 'Online']

export default function Resources() {
  const { profile } = useAuth()
  const trainers = useTrainers(false)
  const venues = useVenues(false)
  const load = useTrainerLoad()
  const unstaffed = useUnstaffed()
  const invalidate = useInvalidate()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState('trainers')
  // Manage-surface filters: these registers grow long and were previously an
  // unfiltered dump with inactive rows greyed out but still in the way.
  const [q, setQ] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  // No `code` — the database assigns it (trg_trainer_autocode / trg_venue_autocode).
  const [tForm, setTForm] = useState({ name: '', email: '', trainer_type: 'Internal', daily_rate: '' })
  const [vForm, setVForm] = useState({ name: '', city: '', capacity: '', venue_type: 'Training Room', day_rate: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [managing, setManaging] = useState<any>(null)

  const canEdit = ['operations', 'super_admin'].includes(profile?.role as string)

  const addTrainer = async () => {
    if (!tForm.name.trim()) return
    if (tForm.daily_rate !== '' && Number(tForm.daily_rate) < 0) { setMsg('Daily rate cannot be negative.'); return }
    setBusy(true); setMsg(null)
    // `code` is intentionally omitted: the insert trigger assigns the next
    // TR-nn. Sending null here is what makes the trigger fill it.
    const { error } = await supabase.from('trainer').insert({
      name: tForm.name.trim(),
      email: tForm.email.trim() || null,
      trainer_type: tForm.trainer_type,
      daily_rate: tForm.daily_rate === '' ? null : Number(tForm.daily_rate),
    })
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { setTForm({ name: '', email: '', trainer_type: 'Internal', daily_rate: '' }); invalidate(['trainers', 'trainer_load']); toast.success('Trainer added.') }
    setBusy(false)
  }

  const addVenue = async () => {
    if (!vForm.name.trim()) return
    if (vForm.capacity !== '' && Number(vForm.capacity) < 0) { setMsg('Capacity cannot be negative.'); return }
    if (vForm.day_rate !== '' && Number(vForm.day_rate) < 0) { setMsg('Day rate cannot be negative.'); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('venue').insert({
      name: vForm.name.trim(),
      city: vForm.city.trim() || null,
      capacity: vForm.capacity === '' ? null : Number(vForm.capacity),
      venue_type: vForm.venue_type,
      day_rate: vForm.day_rate === '' ? null : Number(vForm.day_rate),
    })
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { setVForm({ name: '', city: '', capacity: '', venue_type: 'Training Room', day_rate: '' }); invalidate(['venues']); toast.success('Venue added.') }
    setBusy(false)
  }

  const toggle = async (table: string, idField: string, id: any, active: boolean) => {
    // Deactivating may hide a resource that still backs an upcoming session, so
    // confirm it. Reactivating is safe and needs no gate.
    if (active) {
      const res = await confirm({
        title: 'Deactivate this resource?',
        body: 'It will be hidden from booking pickers. If it already backs an upcoming session, that booking stays but the resource no longer shows as available.',
        confirmLabel: 'Deactivate', tone: 'danger',
      })
      if (!res.ok) return
    }
    setBusy(true); setMsg(null)
    const { error } = await supabase.from(table).update({ active: !active }).eq(idField, id)
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { invalidate([table === 'trainer' ? 'trainers' : 'venues', 'trainer_load']); toast.success('Updated.') }
    setBusy(false)
  }

  if (trainers.isLoading) return <TableSkeleton rows={8} cols={6} />
  if (trainers.error) return <ErrorNote error={trainers.error} />
  if (venues.error) return <ErrorNote error={venues.error} />

  const loadFor = (id: any) => load.data?.find((l: any) => l.trainer_id === id)

  // Name/code/email/city contains-match, plus the active-only default. Applied
  // client-side: both registers are small enough that a round trip per keystroke
  // would cost more than it saves.
  const needle = q.trim().toLowerCase()
  const match = (...fields: any[]) =>
    !needle || fields.some((f) => String(f ?? '').toLowerCase().includes(needle))
  const visibleTrainers = (trainers.data || []).filter(
    (t: any) => (showInactive || t.active) && match(t.name, t.code, t.email),
  )
  const visibleVenues = (venues.data || []).filter(
    (v: any) => (showInactive || v.active) && match(v.name, v.code, v.city),
  )
  const hiddenCount =
    (tab === 'trainers' ? (trainers.data || []).length : (venues.data || []).length) -
    (tab === 'trainers' ? visibleTrainers.length : visibleVenues.length)

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Trainers and venues</h1>
          <p>The registers behind every session. A trainer or room cannot be booked twice on the same training day.</p>
        </div>
      </div>

      {unstaffed.data?.length > 0 && (
        <div className="notice notice-info" style={{ marginBottom: 16 }}>
          {unstaffed.data.length} upcoming session{unstaffed.data.length === 1 ? '' : 's'} without a trainer.
          {unstaffed.data.filter((u: any) => u.days_out <= 21).length > 0 && (
            <> {unstaffed.data.filter((u: any) => u.days_out <= 21).length} inside three weeks.</>
          )}{' '}
          <Link href="/calendar?month=all">Open the calendar</Link>
        </div>
      )}

      <div className="filters">
        {['trainers', 'venues'].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? '' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
        <input
          type="search"
          aria-label={`Search ${tab}`}
          placeholder={tab === 'trainers' ? 'Search name, code or email' : 'Search name, code or city'}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 240 }}
        />
        <label className="toolbar" style={{ gap: 6 }}>
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          <span className="fill-label">Show inactive</span>
        </label>
        {hiddenCount > 0 && (
          <span className="fill-label">{hiddenCount} hidden</span>
        )}
      </div>

      {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

      {tab === 'trainers' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Contact</th><th className="right">Sessions (delivered)</th><th className="right">Next</th><th></th></tr></thead>
              <tbody>
                {visibleTrainers.map((t: any) => {
                  const l = loadFor(t.trainer_id)
                  return (
                    <tr key={t.trainer_id} style={{ opacity: t.active ? 1 : 0.5 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div className="fill-label">{t.code || '—'}{!t.active && ' · inactive'}</div>
                      </td>
                      <td><span className="pill pill-webshop">{t.trainer_type}</span></td>
                      <td className="fill-label">{t.email || '—'}</td>
                      <td className="right">{l ? `${l.sessions} · ${l.training_days}d (${l.delivered} done)` : '—'}</td>
                      <td className="right fill-label">{l?.next_session ? shortDate(l.next_session) : '—'}</td>
                      <td className="right">
                        {canEdit && (
                          <div className="toolbar" style={{ gap: 6, justifyContent: 'flex-end' }}>
                            <button className="linkbtn" onClick={() => setManaging(t)}>Manage</button>
                            <button className="linkbtn" onClick={() => toggle('trainer', 'trainer_id', t.trainer_id, t.active)}>
                              {t.active ? 'Deactivate' : 'Reactivate'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {visibleTrainers.length === 0 && (
              <div className="empty">
                {trainers.data.length === 0
                  ? 'No trainers yet. Add your first below.'
                  : 'No trainers match this search.'}
              </div>
            )}
          </div>

          {canEdit && (
            <div className="card card-pad" style={{ maxWidth: 620 }}>
              <div className="k-label" style={{ marginBottom: 10 }}>Add trainer</div>
              <p className="fill-label" style={{ marginTop: -4, marginBottom: 10 }}>
                The trainer code (TR-nn) is assigned automatically on save.
              </p>
              <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <input aria-label="Trainer full name" placeholder="Full name" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} />
                <input aria-label="Trainer email" placeholder="Email" value={tForm.email} onChange={(e) => setTForm({ ...tForm, email: e.target.value })} />
                <select aria-label="Trainer type" value={tForm.trainer_type} onChange={(e) => setTForm({ ...tForm, trainer_type: e.target.value })}>
                  {T_TYPES.map((x) => (<option key={x}>{x}</option>))}
                </select>
                <input aria-label="Daily rate PHP" type="number" min="0" placeholder="Daily rate PHP" value={tForm.daily_rate} onChange={(e) => setTForm({ ...tForm, daily_rate: e.target.value })} />
              </div>
              <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={addTrainer} disabled={busy}>Add trainer</button>
            </div>
          )}
        </>
      )}

      {tab === 'venues' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Venue</th><th>Type</th><th>City</th><th className="right">Capacity</th><th></th></tr></thead>
              <tbody>
                {visibleVenues.map((v: any) => (
                  <tr key={v.venue_id} style={{ opacity: v.active ? 1 : 0.5 }}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{v.name}</div>
                      <div className="fill-label">{v.code || '—'}{!v.active && ' · inactive'}</div>
                    </td>
                    <td><span className="pill pill-inside">{v.venue_type}</span></td>
                    <td className="fill-label">{v.city || '—'}</td>
                    <td className="right">{v.capacity ?? '—'}</td>
                    <td className="right">
                      {canEdit && (
                        <button className="linkbtn" onClick={() => toggle('venue', 'venue_id', v.venue_id, v.active)}>
                          {v.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleVenues.length === 0 && (
              <div className="empty">
                {(venues.data?.length ?? 0) === 0 ? 'No venues yet.' : 'No venues match this search.'}
              </div>
            )}
          </div>

          {canEdit && (
            <div className="card card-pad" style={{ maxWidth: 620 }}>
              <div className="k-label" style={{ marginBottom: 10 }}>Add venue</div>
              <p className="fill-label" style={{ marginTop: -4, marginBottom: 10 }}>
                The venue code (VN-nn) is assigned automatically on save.
              </p>
              <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <input aria-label="Venue name" placeholder="Venue name" value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} />
                <select aria-label="Venue type" value={vForm.venue_type} onChange={(e) => setVForm({ ...vForm, venue_type: e.target.value })}>
                  {V_TYPES.map((x) => (<option key={x}>{x}</option>))}
                </select>
                <input aria-label="Venue city" placeholder="City" value={vForm.city} onChange={(e) => setVForm({ ...vForm, city: e.target.value })} />
                <input aria-label="Venue capacity" type="number" min="0" placeholder="Capacity" value={vForm.capacity} onChange={(e) => setVForm({ ...vForm, capacity: e.target.value })} />
                <input aria-label="Day rate PHP" type="number" min="0" placeholder="Day rate PHP" value={vForm.day_rate} onChange={(e) => setVForm({ ...vForm, day_rate: e.target.value })} />
              </div>
              <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={addVenue} disabled={busy}>Add venue</button>
            </div>
          )}
        </>
      )}

      {managing && <TrainerManage trainer={managing} onClose={() => setManaging(null)} />}
    </>
  )
}
