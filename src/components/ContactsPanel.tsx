'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useContacts, useClientInteractions, useInvalidate } from '../hooks/data'
import { useToast } from './Toast'
import { useConfirm } from './Confirm'
import { shortDate } from '../lib/format'

// Multiple contacts for a client, plus a simple interaction log.
export default function ContactsPanel({ clientId }: { clientId: string }) {
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidate()
  const contacts = useContacts(clientId)
  const interactions = useClientInteractions(clientId)
  const canEdit = ['super_admin', 'sales'].includes(profile?.role as string)

  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState<any>({ name: '', title: '', email: '', phone: '', is_primary: false })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const addContact = async () => {
    if (!form.name.trim()) { toast.error('Enter a name.'); return }
    setBusy(true)
    const { error } = await supabase.from('contact').insert({
      client_id: clientId, name: form.name.trim(), title: form.title.trim() || null,
      email: form.email.trim() || null, phone: form.phone.trim() || null, is_primary: form.is_primary,
    })
    if (error) toast.error(error.message)
    else { toast.success('Contact added.'); setForm({ name: '', title: '', email: '', phone: '', is_primary: false }); setAdding(false); invalidate(['contacts']) }
    setBusy(false)
  }

  const removeContact = async (cid: string) => {
    const res = await confirm({ title: 'Remove this contact?', confirmLabel: 'Remove', tone: 'danger' })
    if (!res.ok) return
    const { error } = await supabase.from('contact').delete().eq('contact_id', cid)
    if (error) toast.error(error.message); else { toast.success('Contact removed.'); invalidate(['contacts']) }
  }

  const logInteraction = async () => {
    if (!note.trim()) return
    setBusy(true)
    const { error } = await supabase.from('client_interaction').insert({ client_id: clientId, sales_id: profile?.sales_id, note: note.trim() })
    if (error) toast.error(error.message)
    else { setNote(''); invalidate(['interactions']); toast.success('Logged.') }
    setBusy(false)
  }

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <div className="k-label">Contacts</div>
        {canEdit && <button className="btn btn-ghost btn-sm" onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : '+ Contact'}</button>}
      </div>
      {adding && (
        <div className="card card-pad" style={{ marginBottom: 10, maxWidth: 640 }}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <label className="field"><span>Name</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
            <label className="field"><span>Title</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label className="field"><span>Email</span><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="field"><span>Phone</span><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0 8px' }}>
            <input type="checkbox" checked={form.is_primary} style={{ width: 'auto' }} onChange={(e) => setForm({ ...form, is_primary: e.target.checked })} /> Primary contact
          </label>
          <button className="btn btn-sm" onClick={addContact} disabled={busy}>Add contact</button>
        </div>
      )}
      {(contacts.data?.length || 0) === 0 ? (
        <div className="muted fill-label" style={{ marginBottom: 14 }}>No additional contacts.</div>
      ) : (
        <div className="scroll-x">
        <table style={{ marginBottom: 14 }}>
          <thead><tr><th>Name</th><th>Title</th><th>Email</th><th>Phone</th>{canEdit && <th></th>}</tr></thead>
          <tbody>
            {contacts.data.map((c: any) => (
              <tr key={c.contact_id}>
                <td style={{ fontWeight: 600 }}>{c.name}{c.is_primary && <span className="pill pill-inside" style={{ marginLeft: 6 }}>Primary</span>}</td>
                <td className="fill-label">{c.title || '—'}</td>
                <td className="fill-label">{c.email || '—'}</td>
                <td className="fill-label">{c.phone || '—'}</td>
                {canEdit && <td className="right"><button className="linkbtn" onClick={() => removeContact(c.contact_id)}>Remove</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      <div className="k-label" style={{ marginBottom: 8 }}>Interactions</div>
      {canEdit && (
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <input aria-label="Log an interaction" placeholder="Log a call, email or meeting…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && logInteraction()} />
          <button className="btn btn-sm" onClick={logInteraction} disabled={busy}>Log</button>
        </div>
      )}
      {(interactions.data?.length || 0) === 0 ? (
        <div className="muted fill-label">No interactions logged.</div>
      ) : (
        <div className="notes">
          {interactions.data.map((i: any) => (
            <div key={i.interaction_id} className="note">
              <div className="note-meta"><strong>{i.salesperson?.name || 'Sales'}</strong><span className="muted"> · {shortDate(i.date)}</span></div>
              <div>{i.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
