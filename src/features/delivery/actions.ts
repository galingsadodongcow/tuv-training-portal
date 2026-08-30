'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageDelivery } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'

type NoticeKind = 'message' | 'error'

function finish(path: string, kind: NoticeKind, message: string): never {
  const separator = path.includes('?') ? '&' : '?'
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`)
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

function optional(formData: FormData, key: string): string | null {
  return value(formData, key) || null
}

function positiveInteger(raw: string): number | null {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

function manilaTimestamp(raw: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) return null
  return `${raw}:00+08:00`
}

async function requireDeliveryManager(returnPath: string) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active || !canManageDelivery(profile.role)) {
    finish(returnPath, 'error', 'Operations access is required for this action.')
  }
  return profile
}

function databaseMessage(error: { code?: string; message?: string } | null): string {
  const knownWorkflowMessage = error?.message?.split('\n')[0]
  if (['23514', '23505', '23503', '23P01', 'P0002'].includes(error?.code ?? '') && knownWorkflowMessage) {
    return knownWorkflowMessage
  }
  if (error?.code === '42501') return 'Database authorization rejected this action.'
  return 'The requested delivery change could not be saved.'
}

function refreshSession(sessionId?: string) {
  revalidatePath('/training')
  revalidatePath('/participants')
  revalidatePath('/my-work')
  revalidatePath('/overview')
  revalidatePath('/certificates')
  if (sessionId) revalidatePath(`/training/sessions/${sessionId}`)
}

export async function issueEligibleCertificatesAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  await requireDeliveryManager(returnPath)
  const supabase = await createClient()
  const { data: participants, error: listError } = await supabase.rpc('list_participants')
  if (listError) finish(returnPath, 'error', databaseMessage(listError))
  const eligible = (participants ?? []).filter((item: { session_id: string; certificate_status: string }) => item.session_id === sessionId && item.certificate_status === 'eligible')
  if (!eligible.length) finish(returnPath, 'error', 'No eligible certificates are waiting for issuance.')
  let issued = 0
  for (const participant of eligible) {
    const { error } = await supabase.rpc('issue_certificate', { p_participant_id: participant.id })
    if (error) finish(returnPath, 'error', `${issued} certificates were issued before a database validation stopped the batch.`)
    issued += 1
  }
  refreshSession(sessionId)
  finish(returnPath, 'message', `${issued} eligible certificate${issued === 1 ? '' : 's'} issued and ready for controlled PDF download.`)
}

export async function createSessionAction(formData: FormData) {
  await requireDeliveryManager('/training')
  const orderLineId = value(formData, 'order_line_id')
  const startsAt = manilaTimestamp(value(formData, 'starts_at'))
  const endsAt = manilaTimestamp(value(formData, 'ends_at'))
  const capacity = positiveInteger(value(formData, 'capacity'))
  if (!orderLineId || !startsAt || !endsAt || !capacity) {
    finish('/training', 'error', 'Order line, schedule, and positive capacity are required.')
  }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_session', {
    p_order_line_id: orderLineId,
    p_trainer_id: value(formData, 'trainer_id'),
    p_venue_id: value(formData, 'venue_id'),
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_capacity: capacity,
    p_notes: optional(formData, 'notes'),
  })
  if (error || !data) finish('/training', 'error', databaseMessage(error))
  refreshSession(String(data))
  finish(`/training/sessions/${String(data)}`, 'message', 'Session scheduled and added to the delivery calendar.')
}

export async function rescheduleSessionAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  await requireDeliveryManager(returnPath)
  const startsAt = manilaTimestamp(value(formData, 'starts_at'))
  const endsAt = manilaTimestamp(value(formData, 'ends_at'))
  const capacity = positiveInteger(value(formData, 'capacity'))
  if (!startsAt || !endsAt || !capacity) finish(returnPath, 'error', 'Schedule and positive capacity are required.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('reschedule_session', {
    p_session_id: sessionId,
    p_trainer_id: value(formData, 'trainer_id'),
    p_venue_id: value(formData, 'venue_id'),
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_capacity: capacity,
    p_notes: optional(formData, 'notes'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error))
  refreshSession(sessionId)
  finish(returnPath, 'message', 'Session plan updated after conflict and capacity checks.')
}

export async function transitionSessionAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  await requireDeliveryManager(returnPath)
  const action = value(formData, 'transition')
  const supabase = await createClient()
  const { error } = await supabase.rpc('transition_session', {
    p_session_id: sessionId,
    p_action: action,
    p_reason: optional(formData, 'reason'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error))
  refreshSession(sessionId)
  const messages: Record<string, string> = {
    open: 'Registration opened.',
    start: 'Session started. Attendance and outcomes can now be recorded.',
    complete: 'Session completed. Eligible certificates can now be issued.',
    cancel: 'Session cancelled with an audit reason.',
  }
  finish(returnPath, 'message', messages[action] ?? 'Session updated.')
}

export async function registerParticipantAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  await requireDeliveryManager(returnPath)
  const fullName = value(formData, 'full_name')
  if (fullName.length < 2) finish(returnPath, 'error', 'Enter the participant’s full name.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('register_participant', {
    p_session_id: sessionId,
    p_full_name: fullName,
    p_email: optional(formData, 'email'),
    p_phone: optional(formData, 'phone'),
    p_employee_reference: optional(formData, 'employee_reference'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error))
  refreshSession(sessionId)
  finish(returnPath, 'message', 'Participant added. Full sessions place new registrations on the waitlist automatically.')
}

export async function transitionParticipantAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  await requireDeliveryManager(returnPath)
  const action = value(formData, 'transition')
  const supabase = await createClient()
  const { error } = await supabase.rpc('transition_participant', {
    p_participant_id: value(formData, 'participant_id'),
    p_action: action,
    p_reason: optional(formData, 'reason'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error))
  refreshSession(sessionId)
  finish(returnPath, 'message', action === 'confirm' ? 'Registration confirmed.' : 'Registration cancelled; the waitlist was checked automatically.')
}

export async function transferParticipantAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  await requireDeliveryManager(returnPath)
  const supabase = await createClient()
  const { error } = await supabase.rpc('transfer_participant', {
    p_participant_id: value(formData, 'participant_id'),
    p_target_session_id: value(formData, 'target_session_id'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error))
  refreshSession(sessionId)
  finish(returnPath, 'message', 'Participant transferred. Capacity and the source waitlist were reconciled.')
}

export async function recordParticipantOutcomeAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  await requireDeliveryManager(returnPath)
  const minutes = Number(value(formData, 'attended_minutes'))
  const rawScore = optional(formData, 'assessment_score')
  const score = rawScore === null ? null : Number(rawScore)
  if (!Number.isInteger(minutes) || minutes < 0 || (score !== null && (!Number.isFinite(score) || score < 0 || score > 100))) {
    finish(returnPath, 'error', 'Attendance minutes and optional score must be valid numbers.')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('record_participant_outcome', {
    p_participant_id: value(formData, 'participant_id'),
    p_attendance_status: value(formData, 'attendance_status'),
    p_attended_minutes: minutes,
    p_assessment_status: value(formData, 'assessment_status'),
    p_assessment_score: score,
  })
  if (error) finish(returnPath, 'error', databaseMessage(error))
  refreshSession(sessionId)
  finish(returnPath, 'message', 'Attendance, assessment, and certificate eligibility updated together.')
}

export async function issueCertificateAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  await requireDeliveryManager(returnPath)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('issue_certificate', {
    p_participant_id: value(formData, 'participant_id'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error))
  refreshSession(sessionId)
  finish(returnPath, 'message', `Certificate ${String(data)} issued.`)
}

export async function revokeCertificateAction(formData: FormData) {
  const sessionId = value(formData, 'session_id')
  const returnPath = `/training/sessions/${sessionId}`
  const profile = await requireDeliveryManager(returnPath)
  if (profile.role !== 'administrator') finish(returnPath, 'error', 'Administrator access is required to revoke a certificate.')
  const supabase = await createClient()
  const { error } = await supabase.rpc('revoke_certificate', {
    p_participant_id: value(formData, 'participant_id'),
    p_reason: value(formData, 'reason'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error))
  refreshSession(sessionId)
  finish(returnPath, 'message', 'Certificate revoked with an immutable audit reason.')
}
