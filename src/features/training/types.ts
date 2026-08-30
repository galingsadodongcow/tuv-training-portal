export const LEARNING_TYPES = ['classroom', 'virtual', 'onsite'] as const
export type LearningType = (typeof LEARNING_TYPES)[number]

export interface Category {
  id: string
  name: string
  parent_id: string | null
  is_active: boolean
}

export interface Course {
  id: string
  category_id: string
  code: string
  title: string
  duration_minutes: number
  default_capacity: number
  default_min_participants: number
  is_active: boolean
}

export interface CoursePrice {
  id: string
  course_id: string
  learning_type: LearningType
  amount: number
  currency: string
  effective_from: string
  is_active: boolean
}

export interface Trainer {
  id: string
  name: string
  is_active: boolean
}

export interface TrainerCourse {
  id: string
  trainer_id: string
  course_id: string
  is_active: boolean
}

export interface Venue {
  id: string
  name: string
  venue_type: 'physical' | 'virtual'
  capacity: number | null
  address: string | null
  is_active: boolean
}

export interface VenueRoom {
  id: string
  venue_id: string
  name: string
  capacity: number
  equipment: string | null
  is_active: boolean
}

export interface TrainerUnavailability {
  id: string
  trainer_id: string
  starts_at: string
  ends_at: string
  reason: string
  is_active: boolean
}

export interface TrainingCatalogue {
  categories: Category[]
  courses: Course[]
  prices: CoursePrice[]
  trainers: Trainer[]
  trainerCourses: TrainerCourse[]
  venues: Venue[]
  rooms: VenueRoom[]
  trainerUnavailability: TrainerUnavailability[]
}
