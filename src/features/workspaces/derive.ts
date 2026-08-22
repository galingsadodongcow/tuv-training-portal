import type { TrainingCatalogue } from '@/features/training/types'

export interface CatalogueMetrics {
  activeCourses: number
  pricedCourses: number
  activeTrainers: number
  qualifiedTrainers: number
  activeVenues: number
}

export interface ReadinessItem {
  id: string
  severity: 'risk' | 'blocked'
  item: string
  reason: string
}

export function catalogueMetrics(catalogue: TrainingCatalogue): CatalogueMetrics {
  const activeCourses = catalogue.courses.filter((course) => course.is_active)
  const activePrices = catalogue.prices.filter((price) => price.is_active)
  const pricedCourseIds = new Set(activePrices.map((price) => price.course_id))
  const activeTrainers = catalogue.trainers.filter((trainer) => trainer.is_active)
  const qualifiedTrainerIds = new Set(
    catalogue.trainerCourses
      .filter((qualification) => qualification.is_active)
      .map((qualification) => qualification.trainer_id),
  )

  return {
    activeCourses: activeCourses.length,
    pricedCourses: activeCourses.filter((course) => pricedCourseIds.has(course.id)).length,
    activeTrainers: activeTrainers.length,
    qualifiedTrainers: activeTrainers.filter((trainer) => qualifiedTrainerIds.has(trainer.id)).length,
    activeVenues: catalogue.venues.filter((venue) => venue.is_active).length,
  }
}

export function operationsReadiness(catalogue: TrainingCatalogue): ReadinessItem[] {
  const activePrices = new Set(
    catalogue.prices.filter((price) => price.is_active).map((price) => price.course_id),
  )
  const activeQualifications = new Set(
    catalogue.trainerCourses
      .filter((qualification) => qualification.is_active)
      .map((qualification) => qualification.trainer_id),
  )

  const courseItems = catalogue.courses
    .filter((course) => course.is_active && !activePrices.has(course.id))
    .map((course) => ({
      id: `course-${course.id}`,
      severity: 'blocked' as const,
      item: `${course.code} · ${course.title}`,
      reason: 'No active standard price is available for Sales.',
    }))
  const trainerItems = catalogue.trainers
    .filter((trainer) => trainer.is_active && !activeQualifications.has(trainer.id))
    .map((trainer) => ({
      id: `trainer-${trainer.id}`,
      severity: 'risk' as const,
      item: trainer.name,
      reason: 'No active course qualification is recorded.',
    }))
  const venueItems = catalogue.venues.some((venue) => venue.is_active && venue.venue_type === 'physical')
    ? []
    : [{
        id: 'physical-venue',
        severity: 'risk' as const,
        item: 'Physical delivery capacity',
        reason: 'No active physical venue is configured.',
      }]

  return [...courseItems, ...trainerItems, ...venueItems]
}
