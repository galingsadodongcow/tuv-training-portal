'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageDelivery } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import { getDeliveryWorkspace } from '@/features/delivery/queries'
import { parseParticipantCsv, type ParticipantImportRow } from './participantCsv'

export interface ParticipantImportState {
  status: 'idle' | 'preview' | 'success' | 'error'
  message: string
  rows: ParticipantImportRow[]
  fileErrors: string[]
}

export const initialParticipantImportState: ParticipantImportState = { status: 'idle', message: '', rows: [], fileErrors: [] }

export async function participantImportAction(_state: ParticipantImportState, formData: FormData): Promise<ParticipantImportState> {
  const sessionId = String(formData.get('session_id') ?? '')
  const csv = String(formData.get('csv') ?? '')
  const intent = String(formData.get('intent') ?? 'preview')
  const profile = await getCurrentProfile()
  if (!profile?.is_active || !canManageDelivery(profile.role)) return { status: 'error', message: 'Operations access is required.', rows: [], fileErrors: [] }
  const workspace = await getDeliveryWorkspace()
  const session = workspace.sessions.find((item) => item.id === sessionId)
  if (!session || !['scheduled', 'open'].includes(session.status)) return { status: 'error', message: 'This session is not open for participant imports.', rows: [], fileErrors: [] }
  const result = parseParticipantCsv(csv)
  const currentRoster = workspace.participants.filter((item) => item.session_id === sessionId)
  const existingEmails = new Set(currentRoster.map((item) => item.email?.trim().toLowerCase()).filter(Boolean))
  const existingReferences = new Set(currentRoster.map((item) => item.employee_reference?.trim().toLowerCase()).filter(Boolean))
  for (const row of result.rows) {
    if (row.email && existingEmails.has(row.email.toLowerCase())) row.errors.push('Email is already on this session roster.')
    if (row.employee_reference && existingReferences.has(row.employee_reference.toLowerCase())) row.errors.push('Employee reference is already on this session roster.')
  }
  const invalid = result.fileErrors.length + result.rows.filter((row) => row.errors.length).length
  if (intent !== 'commit') {
    return {
      status: invalid ? 'error' : 'preview',
      message: invalid ? 'Resolve the highlighted CSV issues before importing.' : `${result.rows.length} participant${result.rows.length === 1 ? '' : 's'} passed validation. No records have been changed yet.`,
      rows: result.rows,
      fileErrors: result.fileErrors,
    }
  }
  if (invalid || !result.rows.length) return { status: 'error', message: 'Run a clean preview before importing.', rows: result.rows, fileErrors: result.fileErrors }
  const supabase = await createClient()
  let imported = 0
  for (const row of result.rows) {
    const { error } = await supabase.rpc('register_participant', {
      p_session_id: sessionId,
      p_full_name: row.full_name,
      p_email: row.email || null,
      p_phone: row.phone || null,
      p_employee_reference: row.employee_reference || null,
    })
    if (error) return { status: 'error', message: `${imported} records were imported before the database rejected line ${row.line}. Review the roster before retrying.`, rows: result.rows, fileErrors: [] }
    imported += 1
  }
  revalidatePath('/participants')
  revalidatePath('/training')
  revalidatePath(`/training/sessions/${sessionId}`)
  return { status: 'success', message: `${imported} participants imported. Capacity rules automatically placed overflow registrations on the waitlist.`, rows: [], fileErrors: [] }
}
