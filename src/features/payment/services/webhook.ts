import 'server-only'

import type { Webhook } from '@payos/node'
import { PayOSWebhookDto } from '../dto/PaymentDto'
import { fulfillOrder } from './orders'
import { getPayOS } from './payos'

export type WebhookReply = { status: number; body: { success: boolean; message: string } }

// POST /api/payment/webhook. PayOS calls it when a transfer to a payment link arrives.
//   1. The body's shape is checked, then its signature (HMAC with PAYOS_CHECKSUM_KEY, done by the SDK):
//      an unsigned or tampered call is refused with 400 and changes nothing.
//   2. Only a successful payment (code '00', and the data's own code '00') is acted on: the order is
//      fulfilled once (fulfill_order is idempotent, so PayOS's retries pay nothing twice).
//   3. Replies: 200 when handled or deliberately ignored (an unknown order: PayOS's own test call when
//      the webhook URL is confirmed; an underpayment, logged), 500 when the database failed so PayOS
//      retries, 503 when payments aren't configured.
export async function handlePayOSWebhook(raw: unknown): Promise<WebhookReply> {
  const payos = getPayOS()
  if (!payos) return { status: 503, body: { success: false, message: 'Payments are not set up' } }

  const parsed = PayOSWebhookDto.safeParse(raw)
  if (!parsed.success) return { status: 400, body: { success: false, message: 'Invalid webhook body' } }

  let data: Awaited<ReturnType<typeof payos.webhooks.verify>>
  try {
    // The raw body: the signature covers PayOS's data exactly as sent.
    data = await payos.webhooks.verify(raw as Webhook)
  } catch {
    return { status: 400, body: { success: false, message: 'Invalid signature' } }
  }

  if (parsed.data.code !== '00' || data.code !== '00') return { status: 200, body: { success: true, message: 'Ignored: not a successful payment' } }

  const done = await fulfillOrder(data.orderCode, data.amount)
  if (done.success) return { status: 200, body: { success: true, message: done.data.fulfilled ? 'Order fulfilled' : 'Order already fulfilled' } }
  if (done.error.code === 'ORDER_NOT_FOUND') return { status: 200, body: { success: true, message: 'Unknown order' } }
  if (done.error.code === 'PAYMENT_FAILED') return { status: 200, body: { success: true, message: 'Amount does not match the order' } }
  return { status: 500, body: { success: false, message: done.error.message } }
}
