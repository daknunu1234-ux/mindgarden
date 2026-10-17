import { NextResponse, type NextRequest } from 'next/server'
import { httpStatusOf, startCheckout } from '@/features/payment/server'
import { fail } from '@/shared/types/result'

// POST /api/payment/create { productId } (API SPEC.md "Payments"). Auth: Required (session cookie).
// → ActionResult<Checkout>: the order code, PayOS checkout URL and VietQR payload. The price comes
// from the server's catalogue; the body carries only the product id.
export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(fail('VALIDATION_FAILED', 'Expected a JSON body'), { status: 400 })
  }
  const result = await startCheckout(body, request.nextUrl.origin)
  return NextResponse.json(result, { status: httpStatusOf(result), headers: { 'Cache-Control': 'no-store' } })
}
