import { describe, expect, it } from 'vitest'
import type { TrainingCatalogue } from '@/features/training/types'
import { catalogueMetrics, operationsReadiness } from './derive'

const catalogue: TrainingCatalogue = {
  categories: [],
  courses: [
    { id: 'course-1', category_id: 'category', code: 'READY', title: 'Ready course', duration_minutes: 480, default_capacity: 20, is_active: true },
    { id: 'course-2', category_id: 'category', code: 'NO-PRICE', title: 'Unpriced course', duration_minutes: 480, default_capacity: 20, is_active: true },
  ],
  prices: [{ id: 'price', course_id: 'course-1', learning_type: 'virtual', amount: 1000, currency: 'PHP', effective_from: '2026-01-01', is_active: true }],
  trainers: [
    { id: 'trainer-1', name: 'Qualified trainer', is_active: true },
    { id: 'trainer-2', name: 'Unqualified trainer', is_active: true },
  ],
  trainerCourses: [{ id: 'qualification', trainer_id: 'trainer-1', course_id: 'course-1', is_active: true }],
  venues: [],
}

describe('role workspace derivations', () => {
  it('summarizes sellable and schedulable catalogue coverage', () => {
    expect(catalogueMetrics(catalogue)).toEqual({
      activeCourses: 2,
      pricedCourses: 1,
      activeTrainers: 2,
      qualifiedTrainers: 1,
      activeVenues: 0,
    })
  })

  it('creates only actionable Operations readiness items', () => {
    expect(operationsReadiness(catalogue).map((item) => item.id)).toEqual([
      'course-course-2',
      'trainer-trainer-2',
      'physical-venue',
    ])
  })
})
