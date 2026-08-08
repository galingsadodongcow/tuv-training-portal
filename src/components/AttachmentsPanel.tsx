'use client'
import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useAttachments, useInvalidate } from '../hooks/data'
import { useToast } from './Toast'
import { useConfirm } from './Confirm'
import { shortDate } from '../lib/format'

const BUCKET = 'attachments'
const humanSize = (n?: number) => {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
const safeName = (s: string) => s.replace(/[^\w.\-]+/g, '_').slice(0, 120)

// Files attached to one record. Uploads go to a private storage bucket; the row
// here records the metadata and the storage path.
export default function AttachmentsPanel({ entityType, entityId }: { entityType: string; entityId: string }) {
  const { profile } = useAuth()
  const toast = useToast()
  const confirm = useConfirm()
  const invalidate = useInvalidate()
  const files = useAttachments(entityType, entityId)
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const canDelete = (a: any) => a.uploaded_by === profile?.user_id || ['operations', 'super_admin'].includes(profile?.role as string)

  const onPick = async (e: any) => {
    const file: File | undefined = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    const path = `${entityType}/${entityId}/${Date.now()}-${safeName(file.name)}`
    const up = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false })
    if (up.error) { toast.error(up.error.message); setBusy(false); if (inputRef.current) inputRef.current.value = ''; return }
    const { error } = await supabase.from('attachment').insert({
      entity_type: entityType, entity_id: entityId, path, file_name: file.name,
      mime: file.type || null, size: file.size, uploaded_by: profile?.user_id,
    })
    if (error) { toast.error(error.message); await supabase.storage.from(BUCKET).remove([path]) }
    else { toast.success('File uploaded.'); invalidate(['attachments']) }
    setBusy(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  const open = async (a: any) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(a.path, 60)
    if (error || !data?.signedUrl) { toast.error(error?.message || 'Could not open the file.'); return }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  const remove = async (a: any) => {
    const res = await confirm({ title: 'Delete this file?', body: a.file_name, confirmLabel: 'Delete', tone: 'danger' })
    if (!res.ok) return
    const { error } = await supabase.from('attachment').delete().eq('attachment_id', a.attachment_id)
    if (error) { toast.error(error.message); return }
    await supabase.storage.from(BUCKET).remove([a.path])
    toast.success('File removed.'); invalidate(['attachments'])
  }

  return (
    <div>
      <div className="toolbar" style={{ marginBottom: 10 }}>
        <input ref={inputRef} type="file" onChange={onPick} disabled={busy} style={{ maxWidth: 320 }} />
        {busy && <span className="fill-label">Uploading…</span>}
      </div>
      {(files.data?.length || 0) === 0 ? (
        <div className="muted fill-label">No files attached yet.</div>
      ) : (
        <table>
          <thead><tr><th>File</th><th>Size</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {files.data.map((a: any) => (
              <tr key={a.attachment_id}>
                <td><button className="linkbtn" style={{ padding: 0 }} onClick={() => open(a)}>{a.file_name}</button></td>
                <td className="fill-label">{humanSize(a.size)}</td>
                <td className="fill-label">{shortDate(a.created_at)}</td>
                <td className="right">{canDelete(a) && <button className="linkbtn" onClick={() => remove(a)}>Remove</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
