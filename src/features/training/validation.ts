import { LEARNING_TYPES, type LearningType } from './types'

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; message: string }

const text = (value: FormDataEntryValue | null) => String(value ?? '').trim()

function positiveInteger(raw: string, label: string): ValidationResult<number> {
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) return { ok: false, message: `${label} must be a positive whole number.` }
  return { ok: true, value }
}

export function parseCategory(formData: FormData): ValidationResult<{ name: string; parent_id: string | null }> {
  const name = text(formData.get('name'))
  if (name.length < 2 || name.length > 100) return { ok: false, message: 'Category name must be 2–100 characters.' }
  return { ok: true, value: { name, parent_id: text(formData.get('parent_id')) || null } }
}

export function parseCourse(formData: FormData): ValidationResult<{
  category_id: string
  code: string
  title: string
  duration_minutes: number
  default_capacity: number
  default_min_participants: number
}> {
  const category_id = text(formData.get('category_id'))
  const code = text(formData.get('code')).toUpperCase()
  const title = text(formData.get('title'))
  const hours = Number(text(formData.get('duration_hours')))
  const capacity = positiveInteger(text(formData.get('default_capacity')), 'Default capacity')
  if (!category_id) return { ok: false, message: 'Choose a category.' }
  if (!/^[A-Z0-9][A-Z0-9._-]{1,29}$/.test(code)) return { ok: false, message: 'Course code must be 2–30 letters, numbers, dots, dashes, or underscores.' }
  if (title.length < 3 || title.length > 160) return { ok: false, message: 'Course title must be 3–160 characters.' }
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 1000) return { ok: false, message: 'Duration must be between 0.5 and 1,000 hours.' }
  if (!capacity.ok) return capacity
  const minimumText = text(formData.get('default_min_participants'))
  const minimum = minimumText ? positiveInteger(minimumText, 'Default minimum participants') : { ok: true as const, value: Math.min(8, capacity.value) }
  if (!minimum.ok) return minimum
  if (minimum.value > capacity.value) return { ok: false, message: 'Default minimum participants cannot exceed capacity.' }
  return { ok: true, value: { category_id, code, title, duration_minutes: Math.round(hours * 60), default_capacity: capacity.value, default_min_participants: minimum.value } }
}

export function parsePrice(formData: FormData): ValidationResult<{
  course_id: string
  learning_type: LearningType
  amount: number
  currency: string
}> {
  const course_id = text(formData.get('course_id'))
  const learningType = text(formData.get('learning_type'))
  const amount = Number(text(formData.get('amount')))
  const currency = text(formData.get('currency')).toUpperCase()
  if (!course_id) return { ok: false, message: 'Choose a course.' }
  if (!LEARNING_TYPES.includes(learningType as LearningType)) return { ok: false, message: 'Choose a valid learning type.' }
  if (!Number.isFinite(amount) || amount < 0 || amount > 999999999999) return { ok: false, message: 'Enter a valid non-negative price.' }
  if (!/^[A-Z]{3}$/.test(currency)) return { ok: false, message: 'Currency must be a three-letter ISO code.' }
  return { ok: true, value: { course_id, learning_type: learningType as LearningType, amount, currency } }
}

export function parseTrainer(formData: FormData): ValidationResult<{ name: string }> {
  const name = text(formData.get('name'))
  return name.length >= 2 && name.length <= 120
    ? { ok: true, value: { name } }
    : { ok: false, message: 'Trainer name must be 2–120 characters.' }
}

export function parseQualification(formData: FormData): ValidationResult<{ trainer_id: string; course_id: string }> {
  const trainer_id = text(formData.get('trainer_id'))
  const course_id = text(formData.get('course_id'))
  return trainer_id && course_id
    ? { ok: true, value: { trainer_id, course_id } }
    : { ok: false, message: 'Choose both a trainer and a course.' }
}

export function parseVenue(formData: FormData): ValidationResult<{
  name: string
  venue_type: 'physical' | 'virtual'
  capacity: number | null
  address: string | null
}> {
  const name = text(formData.get('name'))
  const venueType = text(formData.get('venue_type'))
  const capacityText = text(formData.get('capacity'))
  const address = text(formData.get('address')) || null
  if (name.length < 2 || name.length > 120) return { ok: false, message: 'Venue name must be 2–120 characters.' }
  if (venueType !== 'physical' && venueType !== 'virtual') return { ok: false, message: 'Choose a valid venue type.' }
  if (venueType === 'virtual') return { ok: true, value: { name, venue_type: venueType, capacity: null, address } }
  const capacity = positiveInteger(capacityText, 'Venue capacity')
  if (!capacity.ok) return capacity
  return { ok: true, value: { name, venue_type: venueType, capacity: capacity.value, address } }
}
