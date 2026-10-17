import 'server-only'

import { PayOS } from '@payos/node'

// The PayOS client (VietQR checkout), built once from the server environment:
//   PAYOS_CLIENT_ID, PAYOS_API_KEY, PAYOS_CHECKSUM_KEY   (never NEXT_PUBLIC_)
// Null when any of them is missing: checkout then answers PAYMENT_UNAVAILABLE and the webhook 503.
let cached: PayOS | null | undefined

export function getPayOS(): PayOS | null {
  if (cached !== undefined) return cached
  const clientId = process.env.PAYOS_CLIENT_ID
  const apiKey = process.env.PAYOS_API_KEY
  const checksumKey = process.env.PAYOS_CHECKSUM_KEY
  cached = clientId && apiKey && checksumKey ? new PayOS({ clientId, apiKey, checksumKey }) : null
  return cached
}

export const isPaymentConfigured = () => getPayOS() !== null

// Tests replace the client.
export function setPayOSForTests(client: PayOS | null | undefined) {
  cached = client
}
