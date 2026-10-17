import type { Metadata } from 'next'
import { getPaymentStatus, PaymentResult } from '@/features/payment'

export const metadata: Metadata = { title: 'Payment · MindGarden' }

// Where PayOS sends the buyer back after paying or cancelling. PayOS appends its query
// (?code=00&id=…&cancel=false&status=PAID&orderCode=…); only the order code is used to look the order
// up, and its status is settled on the server (getPaymentStatus checks with PayOS).
export default async function PaymentResultPage({ searchParams }: PageProps<'/payment/result'>) {
  const params = await searchParams
  const raw = Array.isArray(params.orderCode) ? params.orderCode[0] : params.orderCode
  const orderCode = raw && /^\d{1,16}$/.test(raw) ? Number(raw) : null
  const cancel = Array.isArray(params.cancel) ? params.cancel[0] : params.cancel
  const status = Array.isArray(params.status) ? params.status[0] : params.status
  const initial = orderCode === null ? null : await getPaymentStatus({ orderCode })

  return (
    <main className="mg-meadow-bg w-full flex-1">
      <div className="mx-auto w-full max-w-md px-4 py-14 sm:px-6">
        <PaymentResult orderCode={orderCode} cancelledHint={cancel === 'true' || status === 'CANCELLED'} initial={initial} />
      </div>
    </main>
  )
}
