export const ROLES = ['administrator', 'operations', 'sales', 'manager', 'auditor'] as const

export type Role = (typeof ROLES)[number]

export interface Profile {
  id: string
  full_name: string
  role: Role
  is_active: boolean
  is_sales_supervisor: boolean
}
