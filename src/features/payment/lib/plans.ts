import { COIN_PACKAGES, type CoinPackage } from '@/shared/lib/economy'

// What can be bought with PayOS: coin packs, nothing else (pure, unit-tested). The server prices every
// order from this list; the browser only ever sends a pack id. Mirrored by migration
// 20261022000000_coin_only_payments.sql (orders.plan_type is 'COIN_PACK' only); a test keeps them equal.

export type PlanType = 'COIN_PACK'

export type PaymentProduct = {
  id: CoinPackage['id']
  planType: PlanType
  name: string
  // Price in VND, a whole number (PayOS takes integers).
  amountVnd: number
  // Coins the pack adds to the purse.
  coins: number
  // The transfer description shown in the bank app: PayOS allows 25 characters, and some banks keep
  // only 9 when the account isn't linked through PayOS, so these stay at 9 or fewer.
  description: string
  highlight?: string
}

// The Coin Shop's packages (shared/lib/economy COIN_PACKAGES), sold at their shop prices.
export const COIN_PRODUCTS: readonly PaymentProduct[] = COIN_PACKAGES.map((p) => ({
  id: p.id,
  planType: 'COIN_PACK',
  name: `${p.coins} coins`,
  amountVnd: p.priceVnd,
  coins: p.coins,
  description: `MG C${p.coins}`,
  highlight: p.bestValue ? 'Best value' : undefined,
}))

export const PAYMENT_PRODUCT_IDS = COIN_PRODUCTS.map((p) => p.id) as [PaymentProduct['id'], ...PaymentProduct['id'][]]
export const findProduct = (id: string): PaymentProduct | undefined => COIN_PRODUCTS.find((p) => p.id === id)

// PayOS order codes are positive integers up to Number.MAX_SAFE_INTEGER. Milliseconds since the epoch
// times 1000 plus three random digits: about 1.8e15, increasing, and two checkouts in the same
// millisecond still differ (the database's unique key catches the rest; the server retries).
export function makeOrderCode(nowMs: number, random3: number): number {
  const code = Math.floor(nowMs) * 1000 + (Math.abs(Math.floor(random3)) % 1000)
  if (!Number.isSafeInteger(code) || code <= 0) throw new Error('order code out of range')
  return code
}

// Where PayOS sends the buyer back, paid or cancelled. PayOS appends its own query to it (code, id,
// cancel, status, orderCode), so the path carries none of its own.
export const RETURN_PATH = '/payment/result'
