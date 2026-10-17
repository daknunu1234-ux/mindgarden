import 'server-only'

import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { fail, type ActionResult } from '@/shared/types/result'
import { CreatePaymentDto } from '../dto/PaymentDto'
import { findProduct } from '../lib/plans'
import { createCheckout, type Checkout } from './orders'

// POST /api/payment/create: validate → auth → price the coin pack from the catalogue → order + PayOS link.
// `origin`: where PayOS sends the buyer back (APP_URL when set, else the request's own origin).
export async function startCheckout(body: unknown, origin: string): Promise<ActionResult<Checkout>> {
  const parsed = CreatePaymentDto.safeParse(body)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const user = await getRequestUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to buy')
  const product = findProduct(parsed.data.productId)
  // Coin packs only (the DTO allows nothing else; the database refuses any other plan too).
  if (!product || product.planType !== 'COIN_PACK') return fail('VALIDATION_FAILED', 'Only coin packs can be bought')
  return createCheckout(user.id, product, (process.env.APP_URL || origin).replace(/\/+$/, ''))
}

// HTTP status for an envelope: the body is always the ActionResult.
export function httpStatusOf(result: ActionResult<unknown>): number {
  if (result.success) return 200
  switch (result.error.code) {
    case 'VALIDATION_FAILED':
      return 400
    case 'AUTH_UNAUTHORIZED':
      return 401
    case 'PAYMENT_UNAVAILABLE':
      return 503
    case 'PAYMENT_FAILED':
      return 502
    default:
      return 500
  }
}
