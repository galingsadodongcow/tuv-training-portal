// Participant policy, one place so the form and the database agree.
// Minimum is 8 for every course. Maximum is 20 for professional trainings and
// 10 for IRCA courses. IRCA courses are identified by name.

export const MIN_PAX = 8
export const IRCA_MAX = 10
export const PRO_MAX = 20

export const isIrcaCourse = (name?: string | null): boolean =>
  !!name && /IRCA|Lead Auditor/i.test(name)

export const maxPaxFor = (course?: { course_name?: string | null } | null): number =>
  isIrcaCourse(course?.course_name) ? IRCA_MAX : PRO_MAX
