'use client'

import { useActionState, useState } from 'react'
import { participantImportAction, initialParticipantImportState } from './actions'

export function ParticipantImportForm({
  sessionId,
  defaultOrderLineId,
  allocations,
  customers,
}: {
  sessionId: string
  defaultOrderLineId: string | null
  allocations: { id: string; label: string }[]
  customers: { id: string; name: string }[]
}) {
  const [csv, setCsv] = useState('')
  const [state, action, pending] = useActionState(participantImportAction, initialParticipantImportState)
  const cleanPreview = state.status === 'preview' && state.rows.length > 0 && !state.fileErrors.length && state.rows.every((row) => !row.errors.length)
  return (
    <form action={action} className="import-form">
      <input type="hidden" name="session_id" value={sessionId} />
      {defaultOrderLineId ? <input type="hidden" name="order_line_id" value={defaultOrderLineId} /> : <div className="field-grid"><label className="field"><span>Seat allocation <small>optional</small></span><select name="order_line_id" defaultValue=""><option value="">Unreserved registrations</option>{allocations.map((item) => <option value={item.id} key={item.id}>{item.label}</option>)}</select></label><label className="field"><span>Customer <small>required when unreserved</small></span><select name="customer_id" defaultValue=""><option value="">Choose customer</option>{customers.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>}
      <label className="field"><span>CSV file</span><input type="file" accept=".csv,text/csv" onChange={async (event) => setCsv(await event.currentTarget.files?.[0]?.text() ?? '')} /></label>
      <label className="field"><span>CSV data</span><textarea name="csv" rows={8} value={csv} onChange={(event) => setCsv(event.currentTarget.value)} placeholder="full_name,email,phone,employee_reference" required /></label>
      <p className="form-help">Required column: full_name. Optional columns: email, phone, employee_reference. Maximum 200 rows and 250 KB.</p>
      <div className="row-actions"><button className="button button-secondary" name="intent" value="preview" disabled={pending || !csv.trim()}>{pending ? 'Checking…' : 'Preview and validate'}</button>{cleanPreview ? <button className="button" name="intent" value="commit" disabled={pending}>Import valid rows</button> : null}</div>
      {state.message ? <div className={`alert ${state.status === 'success' || state.status === 'preview' ? 'alert-success' : 'alert-error'}`} role="status">{state.message}</div> : null}
      {state.fileErrors.map((error) => <div className="alert alert-error" key={error}>{error}</div>)}
      {state.rows.length ? <div className="table-wrap"><table><thead><tr><th>Line</th><th>Participant</th><th>Contact</th><th>Employee ref</th><th>Validation</th></tr></thead><tbody>{state.rows.map((row) => <tr key={row.line}><td>{row.line}</td><td className="cell-strong">{row.full_name || 'Missing'}</td><td>{row.email || row.phone || '—'}</td><td>{row.employee_reference || '—'}</td><td>{row.errors.length ? <span className="validation-error">{row.errors.join(' ')}</span> : <span className="validation-ok">Ready</span>}</td></tr>)}</tbody></table></div> : null}
    </form>
  )
}
