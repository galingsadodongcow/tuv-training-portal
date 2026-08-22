import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Profile, Role } from '@/types/auth'
import { ROLES } from '@/types/auth'

function isRole(value: unknown): value is Role {
  return typeof value === 'string' && ROLES.includes(value as Role)
}

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub
  if (!userId) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active, is_sales_supervisor')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data || !isRole(data.role)) return null
  return data as Profile
})
