'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth/profile'
import { canApproveDiscount, canWriteSales } from '@/lib/permissions'
import { createClient } from '@/lib/supabase/server'

type NoticeKind = 'message' | 'error'

function finish(path: string, kind: NoticeKind, message: string): never {
  const separator = path.includes('?') ? '&' : '?'
  redirect(`${path}${separator}${kind}=${encodeURIComponent(message)}`)
}

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? '').trim()
}

function optional(formData: FormData, key: string): string | null {
  return value(formData, key) || null
}

function positiveInteger(raw: string): number | null {
  const parsed = Number(raw)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

async function requireCommercialWriter(returnPath: string) {
  const profile = await getCurrentProfile()
  if (!profile?.is_active || !canWriteSales(profile)) finish(returnPath, 'error', 'Sales access is required for this action.')
  return profile
}

function databaseMessage(code?: string): string {
  if (code === '23505') return 'A matching record already exists. Search before creating another.'
  if (code === '23503') return 'A selected customer, contact, course, or owner is no longer available.'
  if (code === '23514') return 'The requested change does not meet the workflow requirements.'
  if (code === '42501') return 'Database authorization rejected this action.'
  return 'The requested change could not be saved.'
}

export async function createCustomerAction(formData: FormData) {
  const profile = await requireCommercialWriter('/customers')
  const name = value(formData, 'name')
  if (name.length < 2 || name.length > 160) finish('/customers', 'error', 'Enter a customer name between 2 and 160 characters.')

  const supabase = await createClient()
  const { data, error } = await supabase.from('customers').insert({
    name,
    email_domain: optional(formData, 'email_domain')?.toLowerCase(),
    industry: optional(formData, 'industry'),
    address: optional(formData, 'address'),
    created_by: profile.id,
  }).select('id').single()
  if (error || !data) finish('/customers', 'error', databaseMessage(error?.code))
  revalidatePath('/customers')
  finish(`/customers/${data.id}`, 'message', 'Customer created. Add the primary contact next.')
}

export async function createContactAction(formData: FormData) {
  const customerId = value(formData, 'customer_id')
  const returnPath = `/customers/${customerId}`
  const profile = await requireCommercialWriter(returnPath)
  const fullName = value(formData, 'full_name')
  const email = optional(formData, 'email')?.toLowerCase() ?? null
  const phone = optional(formData, 'phone')
  if (!customerId || fullName.length < 2 || (!email && !phone)) {
    finish(returnPath, 'error', 'A contact name and either email or phone are required.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('contacts').insert({
    customer_id: customerId,
    full_name: fullName,
    job_title: optional(formData, 'job_title'),
    email,
    phone,
    created_by: profile.id,
  })
  if (error) finish(returnPath, 'error', databaseMessage(error.code))
  revalidatePath(returnPath)
  finish(returnPath, 'message', 'Contact added.')
}

export async function createInquiryAction(formData: FormData) {
  const profile = await requireCommercialWriter('/sales')
  const customerId = value(formData, 'customer_id')
  const summary = value(formData, 'requirement_summary')
  const participantEstimate = optional(formData, 'participant_estimate')
  if (!customerId || summary.length < 5) finish('/sales', 'error', 'Choose a customer and describe the training requirement.')

  const requestedOwner = value(formData, 'owner_id')
  const ownerId = canApproveDiscount(profile) && requestedOwner ? requestedOwner : profile.id
  const supabase = await createClient()
  const { error } = await supabase.from('inquiries').insert({
    customer_id: customerId,
    contact_id: optional(formData, 'contact_id'),
    course_id: optional(formData, 'course_id'),
    owner_id: ownerId,
    requirement_summary: summary,
    participant_estimate: participantEstimate ? positiveInteger(participantEstimate) : null,
    next_action: optional(formData, 'next_action'),
    follow_up_on: optional(formData, 'follow_up_on'),
  })
  if (error) finish('/sales', 'error', databaseMessage(error.code))
  revalidatePath('/sales')
  revalidatePath('/my-work')
  finish('/sales', 'message', 'Inquiry recorded in the pipeline.')
}

export async function qualifyInquiryAction(formData: FormData) {
  await requireCommercialWriter('/sales')
  const inquiryId = value(formData, 'inquiry_id')
  const supabase = await createClient()
  const { error } = await supabase.from('inquiries').update({ status: 'qualified' }).eq('id', inquiryId).eq('status', 'new')
  if (error) finish('/sales', 'error', databaseMessage(error.code))
  revalidatePath('/sales')
  finish('/sales', 'message', 'Inquiry qualified and ready for quotation.')
}

export async function createQuotationAction(formData: FormData) {
  await requireCommercialWriter('/sales')
  const inquiryId = value(formData, 'inquiry_id')
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_quotation_from_inquiry', { p_inquiry_id: inquiryId })
  if (error || !data) finish('/sales', 'error', databaseMessage(error?.code))
  revalidatePath('/sales')
  finish(`/sales/quotes/${String(data)}`, 'message', 'Quotation created. Add the commercial lines.')
}

export async function addQuotationLineAction(formData: FormData) {
  const quotationId = value(formData, 'quotation_id')
  const returnPath = `/sales/quotes/${quotationId}`
  await requireCommercialWriter(returnPath)
  const participantCount = positiveInteger(value(formData, 'participant_count'))
  const unitPrice = Number(value(formData, 'unit_price'))
  if (!participantCount || !Number.isFinite(unitPrice) || unitPrice < 0) {
    finish(returnPath, 'error', 'Participants must be positive and unit price cannot be negative.')
  }
  const supabase = await createClient()
  const { error } = await supabase.from('quotation_lines').insert({
    quotation_id: quotationId,
    course_id: value(formData, 'course_id'),
    learning_type: value(formData, 'learning_type'),
    participant_count: participantCount,
    unit_price: unitPrice,
    currency: value(formData, 'currency').toUpperCase() || 'PHP',
  })
  if (error) finish(returnPath, 'error', databaseMessage(error.code))
  revalidatePath(returnPath)
  finish(returnPath, 'message', 'Quotation line added.')
}

export async function removeQuotationLineAction(formData: FormData) {
  const quotationId = value(formData, 'quotation_id')
  const returnPath = `/sales/quotes/${quotationId}`
  await requireCommercialWriter(returnPath)
  const supabase = await createClient()
  const { error } = await supabase.from('quotation_lines').delete().eq('id', value(formData, 'line_id'))
  if (error) finish(returnPath, 'error', databaseMessage(error.code))
  revalidatePath(returnPath)
  finish(returnPath, 'message', 'Draft line removed.')
}

export async function updateQuotationDiscountAction(formData: FormData) {
  const quotationId = value(formData, 'quotation_id')
  const returnPath = `/sales/quotes/${quotationId}`
  await requireCommercialWriter(returnPath)
  const discount = Number(value(formData, 'discount_percent'))
  if (!Number.isFinite(discount) || discount < 0 || discount > 100) finish(returnPath, 'error', 'Discount must be between 0 and 100 percent.')
  const supabase = await createClient()
  const { error } = await supabase.from('quotations').update({ discount_percent: discount }).eq('id', quotationId)
  if (error) finish(returnPath, 'error', databaseMessage(error.code))
  revalidatePath(returnPath)
  finish(returnPath, 'message', discount > 10 ? 'Discount saved; supervisor approval is required.' : 'Discount saved.')
}

export async function transitionQuotationAction(formData: FormData) {
  const quotationId = value(formData, 'quotation_id')
  const returnPath = `/sales/quotes/${quotationId}`
  const profile = await requireCommercialWriter(returnPath)
  const action = value(formData, 'transition')
  if (['approve', 'reject'].includes(action) && !canApproveDiscount(profile)) {
    finish(returnPath, 'error', 'Sales Supervisor approval is required.')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('transition_quotation', {
    p_quotation_id: quotationId,
    p_action: action,
    p_reason: optional(formData, 'reason'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error.code))
  revalidatePath('/sales')
  revalidatePath('/my-work')
  revalidatePath(returnPath)
  const message = action === 'submit' ? 'Quotation submitted.' : action === 'approve' ? 'Discount approved and quotation issued.' : action === 'reject' ? 'Discount rejected.' : 'Quotation marked accepted.'
  finish(returnPath, 'message', message)
}

export async function convertQuotationAction(formData: FormData) {
  const quotationId = value(formData, 'quotation_id')
  const returnPath = `/sales/quotes/${quotationId}`
  await requireCommercialWriter(returnPath)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('convert_quotation_to_order', { p_quotation_id: quotationId })
  if (error || !data) finish(returnPath, 'error', databaseMessage(error?.code))
  revalidatePath('/sales')
  finish(`/sales/orders/${String(data)}`, 'message', 'Order created with customer, course, quantity, price, and owner prefilled.')
}

export async function prepareOrderAction(formData: FormData) {
  const orderId = value(formData, 'order_id')
  const returnPath = `/sales/orders/${orderId}`
  await requireCommercialWriter(returnPath)
  const supabase = await createClient()
  const { error } = await supabase.rpc('prepare_order', {
    p_order_id: orderId,
    p_requested_start_date: value(formData, 'requested_start_date'),
    p_delivery_notes: value(formData, 'delivery_notes'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error.code))
  revalidatePath(returnPath)
  finish(returnPath, 'message', 'Order preparation details saved.')
}

export async function transitionOrderAction(formData: FormData) {
  const orderId = value(formData, 'order_id')
  const returnPath = `/sales/orders/${orderId}`
  const profile = await getCurrentProfile()
  if (!profile?.is_active) finish('/', 'error', 'Sign in is required.')
  const action = value(formData, 'transition')
  const salesAction = action === 'send'
  const operationsAction = ['accept', 'return', 'start', 'complete'].includes(action)
  if (salesAction && !canWriteSales(profile)) finish(returnPath, 'error', 'Sales access is required.')
  if (operationsAction && !['administrator', 'operations'].includes(profile.role)) finish(returnPath, 'error', 'Operations access is required.')

  const supabase = await createClient()
  const { error } = await supabase.rpc('transition_order', {
    p_order_id: orderId,
    p_action: action,
    p_reason: optional(formData, 'reason'),
  })
  if (error) finish(returnPath, 'error', databaseMessage(error.code))
  revalidatePath('/sales')
  revalidatePath('/my-work')
  revalidatePath(returnPath)
  const messages: Record<string, string> = {
    send: 'Order sent to Operations.',
    accept: 'Handoff accepted. Operations now owns delivery.',
    return: 'Order returned to Sales for correction.',
    start: 'Fulfillment started.',
    complete: 'Order marked completed.',
  }
  finish(returnPath, 'message', messages[action] ?? 'Order updated.')
}
