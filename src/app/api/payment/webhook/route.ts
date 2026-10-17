import { NextResponse, type NextRequest } from 'next/server'
import { handlePayOSWebhook } from '@/features/payment/server'

// POST /api/payment/webhook (API SPEC.md "Payments"): PayOS payment notifications. No session: the
// body's signature (PAYOS_CHECKSUM_KEY) is what is trusted. Register this URL in the PayOS dashboard
// (https://<your domain>/api/payment/webhook); PayOS's confirmation call answers 200.
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, message: 'Expected a JSON body' }, { status: 400 })
  }
  const reply = await handlePayOSWebhook(body)
  return NextResponse.json(reply.body, { status: reply.status })
}
