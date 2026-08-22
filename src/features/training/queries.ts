import { createClient } from '@/lib/supabase/server'
import type { TrainingCatalogue } from './types'

export async function getTrainingCatalogue(): Promise<TrainingCatalogue> {
  const supabase = await createClient()
  const [categories, courses, prices, trainers, trainerCourses, venues] = await Promise.all([
    supabase.from('categories').select('id, name, parent_id, is_active').order('name'),
    supabase.from('courses').select('id, category_id, code, title, duration_minutes, default_capacity, is_active').order('title'),
    supabase.from('course_prices').select('id, course_id, learning_type, amount, currency, effective_from, is_active').order('effective_from', { ascending: false }),
    supabase.from('trainers').select('id, name, is_active').order('name'),
    supabase.from('trainer_courses').select('id, trainer_id, course_id, is_active'),
    supabase.from('venues').select('id, name, venue_type, capacity, address, is_active').order('name'),
  ])

  const failed = [categories, courses, prices, trainers, trainerCourses, venues].find((result) => result.error)
  if (failed?.error) throw new Error('The training catalogue could not be loaded.')

  return {
    categories: (categories.data ?? []) as TrainingCatalogue['categories'],
    courses: (courses.data ?? []) as TrainingCatalogue['courses'],
    prices: (prices.data ?? []) as TrainingCatalogue['prices'],
    trainers: (trainers.data ?? []) as TrainingCatalogue['trainers'],
    trainerCourses: (trainerCourses.data ?? []) as TrainingCatalogue['trainerCourses'],
    venues: (venues.data ?? []) as TrainingCatalogue['venues'],
  }
}

