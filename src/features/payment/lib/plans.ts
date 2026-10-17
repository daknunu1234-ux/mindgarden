import { COIN_PACKAGES, type CoinPackage } from '@/shared/lib/economy'

// What can be bought with PayOS (pure, unit-tested). The server prices every order from this list;
// the browser only ever sends a product id. Mirrored by migration 20261021000000_payments.sql
// (plan types, the 30 days of PRO_1M in fulfill_order()); a test keeps them equal.

export type PlanType = 'PRO_1M' | 'PRO_LIFETIME' | 'COIN_PACK'
export const PLAN_TYPES: readonly PlanType[] = ['PRO_1M', 'PRO_LIFETIME', 'COIN_PACK']

// Days of Pro one PRO_1M order adds (fulfill_order: interval '30 days').
export const PRO_MONTH_DAYS = 30

export type PaymentProduct = {
  id: 'pro-1m' | 'pro-lifetime' | CoinPackage['id']
  planType: PlanType
  name: string
  // Price in VND, a whole number (PayOS takes integers).
  amountVnd: number
  // Coins a coin pack adds (0 for Pro).
  coins: number
  // The transfer description shown in the bank app: PayOS allows 25 characters, and some banks keep
  // only 9 when the account isn't linked through PayOS, so these stay at 9 or fewer.
  description: string
  highlight?: string
}

export const PRO_PRODUCTS: readonly PaymentProduct[] = [
  { id: 'pro-1m', planType: 'PRO_1M', name: 'Pro · 1 month', amountVnd: 49_000, coins: 0, description: 'MG PRO1M' },
  { id: 'pro-lifetime', planType: 'PRO_LIFETIME', name: 'Pro · Lifetime', amountVnd: 499_000, coins: 0, description: 'MG PROLT', highlight: 'Best value' },
]

// The Coin Shop's packages, sold for real.
export const COIN_PRODUCTS: readonly PaymentProduct[] = COIN_PACKAGES.map((p) => ({
  id: p.id,
  planType: 'COIN_PACK',
  name: `${p.coins} coins`,
  amountVnd: p.priceVnd,
  coins: p.coins,
  description: `MG C${p.coins}`,
  highlight: p.bestValue ? 'Best value' : undefined,
}))

export const PAYMENT_PRODUCTS: readonly PaymentProduct[] = [...PRO_PRODUCTS, ...COIN_PRODUCTS]
export const PAYMENT_PRODUCT_IDS = PAYMENT_PRODUCTS.map((p) => p.id) as [PaymentProduct['id'], ...PaymentProduct['id'][]]
export const findProduct = (id: string): PaymentProduct | undefined => PAYMENT_PRODUCTS.find((p) => p.id === id)

// PayOS order codes are positive integers up to Number.MAX_SAFE_INTEGER. Milliseconds since the epoch
// times 1000 plus three random digits: about 1.8e15, increasing, and two checkouts in the same
// millisecond still differ (the database's unique key catches the rest; the server retries).
export function makeOrderCode(nowMs: number, random3: number): number {
  const code = Math.floor(nowMs) * 1000 + (Math.abs(Math.floor(random3)) % 1000)
  if (!Number.isSafeInteger(code) || code <= 0) throw new Error('order code out of range')
  return code
}

// Pro is active until `proUntil` (an ISO time; 'infinity' for lifetime). Null: never Pro.
export type Membership = { isPro: boolean; lifetime: boolean; proUntil: string | null }
export function membershipOf(proUntil: string | null | undefined, now: Date): Membership {
  if (!proUntil) return { isPro: false, lifetime: false, proUntil: null }
  if (proUntil === 'infinity') return { isPro: true, lifetime: true, proUntil }
  const until = Date.parse(proUntil)
  return { isPro: Number.isFinite(until) && until > now.getTime(), lifetime: false, proUntil }
}

// Where PayOS sends the buyer back, paid or cancelled. PayOS appends its own query to it (code, id,
// cancel, status, orderCode), so the path carries none of its own.
export const RETURN_PATH = '/payment/result'
