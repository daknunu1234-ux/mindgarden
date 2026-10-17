import 'server-only'

import { randomInt } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { makeOrderCode, RETURN_PATH, type PaymentProduct } from '../lib/plans'
import { getPayOS } from './payos'

// Orders and their fulfilment (service role: players can read their orders but never write them, and
// only fulfill_order() credits the coins). Migrations 20261021000000_payments.sql and
// 20261022000000_coin_only_payments.sql (coin packs only).

type Client = SupabaseClient<Database>
const MIGRATION = 'supabase/migrations/20261021000000_payments.sql'
const UNIQUE_VIOLATION = '23505'
const MISSING = new Set(['42P01', 'PGRST205', 'PGRST202', '42883'])
// A payment link stays open this long (PayOS expiredAt, in seconds since the epoch).
const LINK_TTL_SECONDS = 15 * 60

export type OrderStatus = 'PENDING' | 'PAID' | 'CANCELLED'

export type Checkout = {
  orderCode: number
  productId: PaymentProduct['id']
  amount: number
  description: string
  checkoutUrl: string
  // The VietQR payload: any banking app scans it (rendered as a QR code in the modal).
  qrCode: string
  accountName: string
  accountNumber: string
  bin: string
  expiresAt: string | null
}

// Creates a PENDING order priced from the catalogue, then its PayOS payment link. If PayOS refuses,
// the order is cancelled so nothing is left waiting.
export async function createCheckout(userId: string, product: PaymentProduct, origin: string, now: () => number = Date.now): Promise<ActionResult<Checkout>> {
  const payos = getPayOS()
  const admin = createAdminClient()
  if (!payos || !admin) {
    console.error(`[payment] checkout unavailable: ${!payos ? 'PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'} not set`)
    return fail('PAYMENT_UNAVAILABLE', 'Payments are not set up yet')
  }

  let orderCode = 0
  for (let attempt = 0; attempt < 3 && orderCode === 0; attempt++) {
    const code = makeOrderCode(now(), randomInt(1000))
    const { error } = await admin.from('orders').insert({
      order_code: code,
      user_id: userId,
      amount: product.amountVnd,
      plan_type: product.planType,
      product_id: product.id,
      coins: product.coins,
    })
    if (!error) orderCode = code
    else if (error.code !== UNIQUE_VIOLATION) {
      if (error.code && MISSING.has(error.code)) {
        console.error(`[payment] orders table missing: run ${MIGRATION}`)
        return fail('PAYMENT_UNAVAILABLE', 'Payments are not set up yet')
      }
      console.error('[payment] insert order failed', error.code, error.message)
      return fail('INTERNAL_ERROR', 'Could not start the payment')
    }
  }
  if (orderCode === 0) return fail('INTERNAL_ERROR', 'Could not start the payment')

  try {
    const link = await payos.paymentRequests.create({
      orderCode,
      amount: product.amountVnd,
      description: product.description,
      items: [{ name: product.name, quantity: 1, price: product.amountVnd }],
      returnUrl: `${origin}${RETURN_PATH}`,
      cancelUrl: `${origin}${RETURN_PATH}`,
      expiredAt: Math.floor(now() / 1000) + LINK_TTL_SECONDS,
    })
    await admin.from('orders').update({ payment_link_id: link.paymentLinkId }).eq('order_code', orderCode)
    return ok({
      orderCode,
      productId: product.id,
      amount: link.amount,
      description: link.description,
      checkoutUrl: link.checkoutUrl,
      qrCode: link.qrCode,
      accountName: link.accountName,
      accountNumber: link.accountNumber,
      bin: link.bin,
      expiresAt: link.expiredAt ? new Date(link.expiredAt * 1000).toISOString() : null,
    })
  } catch (error) {
    console.error('[payment] PayOS create payment link failed', error instanceof Error ? error.message : error)
    await admin.rpc('cancel_order', { p_order_code: orderCode })
    return fail('PAYMENT_FAILED', 'PayOS could not create the payment. Please try again')
  }
}

export type Fulfilment = { fulfilled: boolean; userId: string; coinsAdded: number; totalCoins: number }

// Marks a paid order PAID and credits its coins to the buyer's purse, once (fulfill_order). Codes:
// ORDER_NOT_FOUND, PAYMENT_FAILED (paid less than the order's price, or not a coin pack),
// PAYMENT_UNAVAILABLE, INTERNAL_ERROR.
export async function fulfillOrder(orderCode: number, amountPaid: number): Promise<ActionResult<Fulfilment>> {
  const admin = createAdminClient()
  if (!admin) {
    console.error('[payment] fulfillOrder: SUPABASE_SERVICE_ROLE_KEY is not set, order not fulfilled')
    return fail('PAYMENT_UNAVAILABLE', 'Payments are not set up yet')
  }
  const { data, error } = await admin.rpc('fulfill_order', { p_order_code: orderCode, p_amount_paid: amountPaid })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('ORDER_NOT_FOUND')) return fail('ORDER_NOT_FOUND', 'No such order')
    if (message.includes('NOT_A_COIN_PACK')) {
      console.error(`[payment] order ${orderCode} is not a coin pack: not fulfilled`)
      return fail('PAYMENT_FAILED', 'Only coin packs can be fulfilled')
    }
    if (message.includes('AMOUNT_MISMATCH')) {
      console.error(`[payment] order ${orderCode} paid ${amountPaid}, less than its price: not fulfilled`)
      return fail('PAYMENT_FAILED', 'The amount paid does not match the order')
    }
    if (error.code && MISSING.has(error.code)) console.error(`[payment] fulfill_order() missing: run ${MIGRATION}`)
    else console.error('[payment] fulfill_order failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not record the payment')
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return fail('INTERNAL_ERROR', 'Could not record the payment')
  return ok({ fulfilled: row.fulfilled, userId: row.user_id, coinsAdded: row.coins_added, totalCoins: row.total_coins })
}

export type PaymentStatus = {
  orderCode: number
  status: OrderStatus
  productId: string
  amount: number
  // Coins the pack adds; totalCoins: the purse now (null if unreadable).
  coins: number
  totalCoins: number | null
}

// The buyer's view of an order (their session, RLS: own orders only). A PENDING order is checked
// with PayOS first: the webhook can't reach a local machine, and can lag, so the return page settles
// it from PayOS's own record (paid → fulfil; cancelled / expired / failed → cancel). Nothing the
// browser says about the payment is trusted.
export async function readPaymentStatus(supabase: Client, userId: string, orderCode: number): Promise<ActionResult<PaymentStatus>> {
  const { data: order, error } = await supabase
    .from('orders')
    .select('order_code, status, product_id, coins, amount')
    .eq('order_code', orderCode)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    if (error.code && MISSING.has(error.code)) return fail('PAYMENT_UNAVAILABLE', 'Payments are not set up yet')
    console.error('[payment] read order failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load the order')
  }
  if (!order) return fail('ORDER_NOT_FOUND', 'No such order')

  let status = order.status as OrderStatus
  const payos = getPayOS()
  if (status === 'PENDING' && payos) {
    try {
      const link = await payos.paymentRequests.get(orderCode)
      if (link.status === 'PAID') {
        const done = await fulfillOrder(orderCode, link.amountPaid)
        if (done.success) status = 'PAID'
      } else if (link.status === 'CANCELLED' || link.status === 'EXPIRED' || link.status === 'FAILED') {
        const admin = createAdminClient()
        const { data: next } = admin ? await admin.rpc('cancel_order', { p_order_code: orderCode }) : { data: null }
        if (next === 'CANCELLED' || next === 'PAID') status = next
      }
    } catch (e) {
      // PayOS unreachable: report what the database knows; the webhook or a later check settles it.
      console.error('[payment] PayOS status check failed', e instanceof Error ? e.message : e)
    }
  }

  const { data: user } = await supabase.from('users').select('coins').eq('id', userId).maybeSingle()
  return ok({ orderCode, status, productId: order.product_id, amount: Number(order.amount), coins: order.coins, totalCoins: user?.coins ?? null })
}
