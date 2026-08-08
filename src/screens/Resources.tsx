'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTrainers, useVenues, useTrainerLoad, useUnstaffed, useInvalidate } from '../hooks/data'
import { Spinner, ErrorNote } from '../components/ui'
import { useToast } from '../components/Toast'
import { TableSkeleton } from '../components/Skeleton'
import { shortDate, num } from '../lib/format'
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
  const [tab, setTab] = useState('trainers')
  const [tForm, setTForm] = useState({ name: '', code: '', email: '', trainer_type: 'Internal', daily_rate: '' })
  const [vForm, setVForm] = useState({ name: '', city: '', capacity: '', venue_type: 'Training Room', day_rate: '' })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [managing, setManaging] = useState<any>(null)

  const canEdit = ['operations', 'super_admin'].includes(profile?.role as string)

  const addTrainer = async () => {
    if (!tForm.name.trim()) return
    if (tForm.daily_rate !== '' && Number(tForm.daily_rate) < 0) { setMsg('Daily rate cannot be negative.'); return }
    setBusy(true); setMsg(null)
    const { error } = await supabase.from('trainer').insert({
      name: tForm.name.trim(),
      code: tForm.code.trim() || null,
      email: tForm.email.trim() || null,
      trainer_type: tForm.trainer_type,
      daily_rate: tForm.daily_rate === '' ? null : Number(tForm.daily_rate),
    })
    if (error) { setMsg(error.message); toast.error(error.message) }
    else { setTForm({ name: '', code: '', email: '', trainer_type: 'Internal', daily_rate: '' }); invalidate(['trainers', 'trainer_load']); toast.success('Trainer added.') }
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
        {['trainers', 'venues', 'load'].map((t) => (
          <button key={t} className={`btn btn-sm ${tab === t ? '' : 'btn-ghost'}`} onClick={() => setTab(t)}>
            {t === 'load' ? 'Trainer load' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {msg && <div className="notice notice-error" style={{ marginBottom: 12 }}>{msg}</div>}

      {tab === 'trainers' && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Contact</th><th className="right">Sessions</th><th className="right">Next</th><th></th></tr></thead>
              <tbody>
                {trainers.data.map((t: any) => {
                  const l = loadFor(t.trainer_id)
                  return (
                    <tr key={t.trainer_id} style={{ opacity: t.active ? 1 : 0.5 }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{t.name}</div>
                        <div className="fill-label">{t.code || '—'}{!t.active && ' · inactive'}</div>
                      </td>
                      <td><span className="pill pill-webshop">{t.trainer_type}</span></td>
                      <td className="fill-label">{t.email || '—'}</td>
                      <td className="right">{l ? `${l.sessions} · ${l.training_days}d` : '—'}</td>
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
            {trainers.data.length === 0 && <div className="empty">No trainers yet. Add your first below.</div>}
          </div>

          {canEdit && (
            <div className="card card-pad" style={{ maxWidth: 620 }}>
              <div className="k-label" style={{ marginBottom: 10 }}>Add trainer</div>
              <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <input placeholder="Full name" value={tForm.name} onChange={(e) => setTForm({ ...tForm, name: e.target.value })} />
                <input placeholder="Code" value={tForm.code} onChange={(e) => setTForm({ ...tForm, code: e.target.value })} />
                <input placeholder="Email" value={tForm.email} onChange={(e) => setTForm({ ...tForm, email: e.target.value })} />
                <select value={tForm.trainer_type} onChange={(e) => setTForm({ ...tForm, trainer_type: e.target.value })}>
                  {T_TYPES.map((x) => (<option key={x}>{x}</option>))}
                </select>
                <input type="number" min="0" placeholder="Daily rate PHP" value={tForm.daily_rate} onChange={(e) => setTForm({ ...tForm, daily_rate: e.target.value })} />
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
                {venues.data?.map((v: any) => (
                  <tr key={v.venue_id} style={{ opacity: v.active ? 1 : 0.5 }}>
                    <td style={{ fontWeight: 600 }}>{v.name}{!v.active && <span className="fill-label"> · inactive</span>}</td>
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
            {venues.data?.length === 0 && <div className="empty">No venues yet.</div>}
          </div>

          {canEdit && (
            <div className="card card-pad" style={{ maxWidth: 620 }}>
              <div className="k-label" style={{ marginBottom: 10 }}>Add venue</div>
              <div className="grid" style={{ gridTemplateColumns: '2fr 1fr' }}>
                <input placeholder="Venue name" value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} />
                <select value={vForm.venue_type} onChange={(e) => setVForm({ ...vForm, venue_type: e.target.value })}>
                  {V_TYPES.map((x) => (<option key={x}>{x}</option>))}
                </select>
                <input placeholder="City" value={vForm.city} onChange={(e) => setVForm({ ...vForm, city: e.target.value })} />
                <input type="number" min="0" placeholder="Capacity" value={vForm.capacity} onChange={(e) => setVForm({ ...vForm, capacity: e.target.value })} />
                <input type="number" min="0" placeholder="Day rate PHP" value={vForm.day_rate} onChange={(e) => setVForm({ ...vForm, day_rate: e.target.value })} />
              </div>
              <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={addVenue} disabled={busy}>Add venue</button>
            </div>
          )}
        </>
      )}

      {tab === 'load' && (
        <div className="card">
          <table>
            <thead><tr><th>Trainer</th><th>Type</th><th className="right">Sessions</th><th className="right">Training days</th><th className="right">Delivered</th><th className="right">Next</th></tr></thead>
            <tbody>
              {load.data?.map((l: any) => (
                <tr key={l.trainer_id}>
                  <td style={{ fontWeight: 600 }}>{l.name}</td>
                  <td className="fill-label">{l.trainer_type}</td>
                  <td className="right">{num(l.sessions)}</td>
                  <td className="right">{num(l.training_days)}</td>
                  <td className="right">{num(l.delivered)}</td>
                  <td className="right fill-label">{l.next_session ? shortDate(l.next_session) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {load.data?.length === 0 && <div className="empty">No trainer activity yet.</div>}
        </div>
      )}

      {managing && <TrainerManage trainer={managing} onClose={() => setManaging(null)} />}
    </>
  )
}
