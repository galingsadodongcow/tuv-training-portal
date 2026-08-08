// Participant policy, one place so the form and the database agree.
// Minimum is 8 for every course. The cap comes from the course itself:
// is_certification caps at 10, max_pax overrides the cap for any course, and
// everything else caps at 20. Before those columns exist the old name match
// (IRCA / Lead Auditor) is the fallback, so behaviour is unchanged pre-migration.

export const MIN_PAX = 8
export const IRCA_MAX = 10
export const PRO_MAX = 20

export const isIrcaCourse = (name?: string | null): boolean =>
  !!name && /IRCA|Lead Auditor/i.test(name)

// True when the course is treated as a certification course (10-seat cap).
export const isCertCourse = (course?: any): boolean =>
  typeof course?.is_certification === 'boolean' ? course.is_certification : isIrcaCourse(course?.course_name)

export const maxPaxFor = (course?: any): number => {
  if (typeof course?.max_pax === 'number' && course.max_pax > 0) return course.max_pax
  return isCertCourse(course) ? IRCA_MAX : PRO_MAX
}
