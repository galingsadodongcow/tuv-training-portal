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

type Entity = 'categories' | 'courses' | 'course_prices' | 'trainers' | 'trainer_courses' | 'venues'

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

export async function setActiveAction(formData: FormData) {
  await requireWriter()
  const entity = String(formData.get('entity') ?? '') as Entity
  const id = String(formData.get('id') ?? '')
  const isActive = String(formData.get('is_active')) === 'true'
  const allowed: Entity[] = ['categories', 'courses', 'course_prices', 'trainers', 'trainer_courses', 'venues']
  if (!allowed.includes(entity) || !id) finish('error', 'The requested record is invalid.')

  const supabase = await createClient()
  const { error } = await supabase.from(entity).update({ is_active: isActive }).eq('id', id)
  if (error) finish('error', databaseMessage(error.code))
  revalidatePath('/administration')
  finish('message', isActive ? 'Record activated.' : 'Record deactivated.')
}

