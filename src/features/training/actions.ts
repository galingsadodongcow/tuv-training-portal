'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canManageTraining } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'
import {
  parseCategory,
  parseCourse,
  parsePrice,
  parseQualification,
  parseTrainer,
  parseVenue,
  type ValidationResult,
} from './validation'

type Entity = 'categories' | 'courses' | 'course_prices' | 'trainers' | 'trainer_courses' | 'venues' | 'venue_rooms' | 'trainer_unavailability'

function finish(kind: 'message' | 'error', message: string): never {
  redirect(`/administration?${kind}=${encodeURIComponent(message)}`)
}

async function requireWriter() {
  const profile = await getCurrentProfile()
  if (!profile?.is_active || !canManageTraining(profile.role)) finish('error', 'You do not have permission to change training configuration.')
}

function valid<T>(result: ValidationResult<T>): T {
  if (!result.ok) finish('error', result.message)
  return result.value
}

function databaseMessage(code?: string): string {
  if (code === '23505') return 'That record already exists.'
  if (code === '23503') return 'The selected related record is no longer available.'
  if (code === '23514') return 'One or more values break a catalogue rule.'
  return 'The change could not be saved.'
}

async function insert(entity: Entity, values: Record<string, unknown>, success: string) {
  await requireWriter()
  const supabase = await createClient()
  const { error } = await supabase.from(entity).insert(values)
  if (error) finish('error', databaseMessage(error.code))
  revalidatePath('/administration')
  finish('message', success)
}

export async function createCategoryAction(formData: FormData) {
  await insert('categories', valid(parseCategory(formData)), 'Category created.')
}

export async function createCourseAction(formData: FormData) {
  await insert('courses', valid(parseCourse(formData)), 'Course created. Add its standard price below.')
}

export async function createPriceAction(formData: FormData) {
  await insert('course_prices', valid(parsePrice(formData)), 'Standard price added.')
}

export async function createTrainerAction(formData: FormData) {
  await insert('trainers', valid(parseTrainer(formData)), 'Trainer created.')
}

export async function createQualificationAction(formData: FormData) {
  await insert('trainer_courses', valid(parseQualification(formData)), 'Trainer qualification added.')
}

export async function createVenueAction(formData: FormData) {
  await insert('venues', valid(parseVenue(formData)), 'Venue created.')
}

export async function createRoomAction(formData: FormData) {
  const venueId = String(formData.get('venue_id') ?? '').trim()
  const name = String(formData.get('name') ?? '').trim()
  const capacity = Number(formData.get('capacity'))
  const equipment = String(formData.get('equipment') ?? '').trim() || null
  if (!venueId || name.length < 1 || name.length > 120 || !Number.isInteger(capacity) || capacity <= 0) {
    finish('error', 'Choose a venue and enter a room name and positive whole-number capacity.')
  }
  await insert('venue_rooms', { venue_id: venueId, name, capacity, equipment }, 'Venue room created.')
}

export async function createTrainerUnavailabilityAction(formData: FormData) {
  await requireWriter()
  const profile = await getCurrentProfile()
  const trainerId = String(formData.get('trainer_id') ?? '').trim()
  const starts = String(formData.get('starts_at') ?? '').trim()
  const ends = String(formData.get('ends_at') ?? '').trim()
  const reason = String(formData.get('reason') ?? '').trim()
  if (!profile || !trainerId || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(starts)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(ends) || reason.length < 3) {
    finish('error', 'Trainer, start, end, and a short unavailability reason are required.')
  }
  await insert('trainer_unavailability', {
    trainer_id: trainerId,
    starts_at: `${starts}:00+08:00`,
    ends_at: `${ends}:00+08:00`,
    reason,
    created_by: profile.id,
  }, 'Trainer unavailability recorded and conflict checks updated.')
}

export async function setActiveAction(formData: FormData) {
  await requireWriter()
  const entity = String(formData.get('entity') ?? '') as Entity
  const id = String(formData.get('id') ?? '')
  const isActive = String(formData.get('is_active')) === 'true'
  const allowed: Entity[] = ['categories', 'courses', 'course_prices', 'trainers', 'trainer_courses', 'venues', 'venue_rooms', 'trainer_unavailability']
  if (!allowed.includes(entity) || !id) finish('error', 'The requested record is invalid.')

  const supabase = await createClient()
  const { error } = await supabase.from(entity).update({ is_active: isActive }).eq('id', id)
  if (error) finish('error', databaseMessage(error.code))
  revalidatePath('/administration')
  finish('message', isActive ? 'Record activated.' : 'Record deactivated.')
}
