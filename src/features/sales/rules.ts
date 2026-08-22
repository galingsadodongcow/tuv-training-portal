import type { Inquiry, OrderLine, QuotationLine } from './types'

export function quotationTotals(lines: QuotationLine[], discountPercent: number) {
  const subtotal = lines.reduce((sum, line) => sum + Number(line.unit_price) * line.participant_count, 0)
  const discount = subtotal * (Number(discountPercent) / 100)
  return { subtotal, discount, total: subtotal - discount }
}

export function orderTotal(lines: OrderLine[]) {
  return lines.reduce((sum, line) => sum + Number(line.unit_price) * line.participant_count, 0)
}

export function isOverdueInquiry(inquiry: Inquiry, today: string): boolean {
  return Boolean(
    inquiry.follow_up_on
    && inquiry.follow_up_on < today
    && !['won', 'lost'].includes(inquiry.status),
  )
}

export function displayNumber(prefix: 'INQ' | 'Q' | 'ORD', value: number): string {
  return `${prefix}-${String(value).padStart(5, '0')}`
}
