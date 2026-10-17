import { z } from 'zod'
import { PAYMENT_PRODUCT_IDS } from '../lib/plans'

// POST /api/payment/create: only a product id. The amount, plan and coins come from the server's
// catalogue (lib/plans.ts), never from the browser.
export const CreatePaymentDto = z.object({ productId: z.enum(PAYMENT_PRODUCT_IDS) })
export type CreatePaymentInput = z.infer<typeof CreatePaymentDto>

// getPaymentStatus: the PayOS order code (a positive safe integer; from the URL, so coerced).
export const PaymentStatusDto = z.object({ orderCode: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER) })
export type PaymentStatusInput = z.infer<typeof PaymentStatusDto>

// The webhook body as PayOS sends it. Only its shape is checked here; the signature is verified by the
// SDK (payOS.webhooks.verify) before anything in it is trusted.
export const PayOSWebhookDto = z.object({
  code: z.string(),
  desc: z.string(),
  success: z.boolean(),
  signature: z.string().min(1),
  data: z
    .object({
      orderCode: z.number(),
      amount: z.number(),
      description: z.string(),
      accountNumber: z.string(),
      reference: z.string(),
      transactionDateTime: z.string(),
      currency: z.string(),
      paymentLinkId: z.string(),
      code: z.string(),
      desc: z.string(),
    })
    .passthrough(),
})
