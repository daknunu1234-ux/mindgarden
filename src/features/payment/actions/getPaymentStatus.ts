'use server'

import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { PaymentStatusDto } from '../dto/PaymentDto'
import { readPaymentStatus, type PaymentStatus } from '../services/orders'

// Auth: Required (the buyer). The order's status, settled with PayOS when still pending (paid →
// coins credited, cancelled / expired → cancelled), plus the buyer's purse. Polled by the payment
// modal and the return page. Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, ORDER_NOT_FOUND,
// PAYMENT_UNAVAILABLE, INTERNAL_ERROR.
export async function getPaymentStatus(input: unknown): Promise<ActionResult<PaymentStatus>> {
  const parsed = PaymentStatusDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const user = await getRequestUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to see your order')
  return readPaymentStatus(await createClient(), user.id, parsed.data.orderCode)
}
