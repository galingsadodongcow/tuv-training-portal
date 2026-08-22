'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/profile'
import { createClient } from '@/lib/supabase/server'
import { ROLES, type Role } from '@/types/auth'

function finish(kind: 'message' | 'error', message: string): never {
  redirect(`/administration?${kind}=${encodeURIComponent(message)}#users`)
}

function isRole(value: string): value is Role {
  return ROLES.includes(value as Role)
}

export async function updateProfileAccessAction(formData: FormData) {
  const current = await getCurrentProfile()
  if (!current?.is_active || current.role !== 'administrator') {
    finish('error', 'Only an administrator can change user access.')
  }

  const id = String(formData.get('id') ?? '')
  const role = String(formData.get('role') ?? '')
  const isActive = String(formData.get('status') ?? '') === 'active'
  const isSalesSupervisor = role === 'sales' && String(formData.get('sales_scope') ?? '') === 'supervisor'
  if (!id || !isRole(role)) finish('error', 'The requested access change is invalid.')
  if (id === current.id && (!isActive || role !== 'administrator')) {
    finish('error', 'You cannot remove your own administrator access.')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ role, is_active: isActive, is_sales_supervisor: isSalesSupervisor })
    .eq('id', id)
  if (error) finish('error', 'The access change could not be saved.')

  revalidatePath('/administration')
  finish('message', 'User access updated and audited.')
}
