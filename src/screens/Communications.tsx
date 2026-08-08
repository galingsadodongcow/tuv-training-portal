'use client'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useTemplates, useCommsLog, useInvalidate } from '../hooks/data'
import { ErrorNote } from '../components/ui'
import { TableSkeleton } from '../components/Skeleton'
import { useToast } from '../components/Toast'

const STATUS_TONE: Record<string, string> = { Queued: 'pill-tentative', Sent: 'pill-go', Failed: 'pill-cancelled' }

export default function Communications() {
  const templates = useTemplates()
  const log = useCommsLog()
  const invalidate = useInvalidate()
  const toast = useToast()
  const [tab, setTab] = useState<'log' | 'templates'>('log')
  const [busy, setBusy] = useState(false)
  const [edit, setEdit] = useState<any>(null)

  const runReminders = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('fn_queue_reminders')
    if (error) toast.error(error.message)
    else { toast.success(`${data || 0} reminder${data === 1 ? '' : 's'} queued.`); invalidate(['comms_log']) }
    setBusy(false)
  }

  const saveTemplate = async () => {
    if (!edit) return
    setBusy(true)
    const { error } = await supabase.from('message_template')
      .update({ subject: edit.subject, body: edit.body, active: edit.active, updated_at: new Date().toISOString() })
      .eq('template_key', edit.template_key)
    if (error) toast.error(error.message)
    else { toast.success('Template saved.'); setEdit(null); invalidate(['templates']) }
    setBusy(false)
  }

  if (log.isLoading) return <TableSkeleton rows={6} cols={5} />
  if (log.error) return <ErrorNote error={log.error} />

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Communications</h1>
          <p>Templated emails, the outbound log, and reminders. Sending runs through the send-comms function.</p>
        </div>
        <div className="toolbar">
          <button className="btn btn-sm" onClick={runReminders} disabled={busy}>{busy ? 'Queuing…' : 'Run reminders now'}</button>
          <div className="seg">
            <button className={`seg-btn ${tab === 'log' ? 'on' : ''}`} onClick={() => setTab('log')}>Log</button>
            <button className={`seg-btn ${tab === 'templates' ? 'on' : ''}`} onClick={() => setTab('templates')}>Templates</button>
          </div>
        </div>
      </div>

      {tab === 'log' && (
        <div className="card">
          {(log.data?.length || 0) === 0 ? (
            <div className="empty">No messages yet. Run reminders or send from a record.</div>
          ) : (
            <table>
              <thead><tr><th>Status</th><th>To</th><th>Subject</th><th>Template</th><th>When</th></tr></thead>
              <tbody>
                {log.data.map((m: any) => (
                  <tr key={m.comm_id}>
                    <td><span className={`pill ${STATUS_TONE[m.status] || 'pill-webshop'}`}>{m.status}</span></td>
                    <td className="fill-label">{m.to_email}</td>
                    <td>{m.subject}{m.error && <div className="fill-label" style={{ color: 'var(--danger)' }}>{m.error}</div>}</td>
                    <td className="fill-label">{m.template_key || '—'}</td>
                    <td className="fill-label">{m.sent_at ? new Date(m.sent_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : new Date(m.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'templates' && (
        <div className="card">
          {(templates.data?.length || 0) === 0 ? (
            <div className="empty">No templates. Apply the communications migration to seed the defaults.</div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Subject</th><th>Active</th><th></th></tr></thead>
              <tbody>
                {templates.data.map((t: any) => (
                  <tr key={t.template_key}>
                    <td style={{ fontWeight: 600 }}>{t.name}</td>
                    <td className="fill-label">{t.subject}</td>
                    <td className="fill-label">{t.active ? 'Yes' : 'No'}</td>
                    <td className="right"><button className="linkbtn" onClick={() => setEdit({ ...t })}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {edit && (
        <div className="cmdk-scrim" onClick={() => setEdit(null)}>
          <div className="card card-pad" style={{ maxWidth: 640, width: '100%', margin: '8vh auto' }} onClick={(e) => e.stopPropagation()}>
            <div className="k-label" style={{ marginBottom: 8 }}>Edit template · {edit.name}</div>
            <label className="field"><span>Subject</span><input value={edit.subject} onChange={(e) => setEdit({ ...edit, subject: e.target.value })} /></label>
            <label className="field"><span>Body</span><textarea rows={8} value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
              <input type="checkbox" checked={edit.active} style={{ width: 'auto' }} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active
            </label>
            <div className="fill-label" style={{ marginBottom: 8 }}>Use placeholders like {'{{name}}'}, {'{{course}}'}, {'{{date}}'}, {'{{order}}'}, {'{{balance}}'}.</div>
            <div className="toolbar">
              <button className="btn btn-sm" onClick={saveTemplate} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
