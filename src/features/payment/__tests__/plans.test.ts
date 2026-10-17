import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COIN_PACKAGES } from '@/shared/lib/economy'
import { CreatePaymentDto, PaymentStatusDto } from '../dto/PaymentDto'
import { COIN_PRODUCTS, findProduct, makeOrderCode, membershipOf, PAYMENT_PRODUCTS, PLAN_TYPES, PRO_MONTH_DAYS, PRO_PRODUCTS, RETURN_PATH } from '../lib/plans'

const SQL = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261021000000_payments.sql'), 'utf8')

describe('the catalogue', () => {
  it('offers Pro for a month, Pro for life, and every Coin Shop package at its shop price', () => {
    expect(PRO_PRODUCTS.map((p) => [p.id, p.planType])).toEqual([
      ['pro-1m', 'PRO_1M'],
      ['pro-lifetime', 'PRO_LIFETIME'],
    ])
    expect(COIN_PRODUCTS.map((p) => [p.id, p.coins, p.amountVnd])).toEqual(COIN_PACKAGES.map((p) => [p.id, p.coins, p.priceVnd]))
    expect(new Set(PAYMENT_PRODUCTS.map((p) => p.id)).size).toBe(PAYMENT_PRODUCTS.length)
  })

  it('prices are whole VND above PayOS’s minimum; descriptions fit every bank (9 characters)', () => {
    for (const p of PAYMENT_PRODUCTS) {
      expect(Number.isInteger(p.amountVnd), p.id).toBe(true)
      expect(p.amountVnd, p.id).toBeGreaterThanOrEqual(2000)
      expect(p.description.length, p.id).toBeLessThanOrEqual(9)
      expect(p.description).toMatch(/^[A-Z0-9 ]+$/)
      // Coins only for coin packs (the database checks the same).
      expect(p.coins > 0, p.id).toBe(p.planType === 'COIN_PACK')
    }
  })

  it('matches the migration: plan types, statuses and the 30 days of a month', () => {
    expect(SQL).toContain(`check (plan_type in (${PLAN_TYPES.map((t) => `'${t}'`).join(', ')}))`)
    expect(SQL).toContain("check (status in ('PENDING', 'PAID', 'CANCELLED'))")
    expect(SQL).toContain(`interval '${PRO_MONTH_DAYS} days'`)
    expect(SQL).toContain('check ((plan_type = \'COIN_PACK\') = (coins > 0))')
  })

  it('the browser can only name a product; amounts are never accepted', () => {
    expect(CreatePaymentDto.parse({ productId: 'pro-1m', amount: 1, coins: 999999 })).toEqual({ productId: 'pro-1m' })
    expect(CreatePaymentDto.safeParse({ productId: 'free-stuff' }).success).toBe(false)
    expect(findProduct('coins-50')).toMatchObject({ planType: 'COIN_PACK', coins: 50, amountVnd: 40_000 })
    expect(findProduct('nope')).toBeUndefined()
    expect(PaymentStatusDto.parse({ orderCode: '1760000000000123' })).toEqual({ orderCode: 1760000000000123 })
    expect(PaymentStatusDto.safeParse({ orderCode: '-5' }).success).toBe(false)
    expect(PaymentStatusDto.safeParse({ orderCode: '99999999999999999999' }).success).toBe(false)
  })
})

describe('order codes', () => {
  it('are positive JavaScript-safe integers that grow with time and differ within a millisecond', () => {
    const now = Date.parse('2026-10-17T10:00:00Z')
    const a = makeOrderCode(now, 7)
    expect(a).toBe(now * 1000 + 7)
    expect(Number.isSafeInteger(a)).toBe(true)
    expect(a).toBeLessThan(Number.MAX_SAFE_INTEGER)
    expect(makeOrderCode(now, 8)).not.toBe(a)
    expect(makeOrderCode(now + 1, 0)).toBeGreaterThan(makeOrderCode(now, 999))
    // Inside the database's range check too.
    expect(SQL).toContain('check (order_code > 0 and order_code <= 9007199254740991)')
  })
})

describe('membership', () => {
  const now = new Date('2026-10-17T10:00:00Z')
  it('is Pro until the end date, for life with infinity, and not without one', () => {
    expect(membershipOf(null, now)).toEqual({ isPro: false, lifetime: false, proUntil: null })
    expect(membershipOf('2026-11-16T10:00:00+00:00', now)).toMatchObject({ isPro: true, lifetime: false })
    expect(membershipOf('2026-10-01T00:00:00+00:00', now)).toMatchObject({ isPro: false })
    expect(membershipOf('infinity', now)).toEqual({ isPro: true, lifetime: true, proUntil: 'infinity' })
  })

  it('PayOS returns to a plain path (it appends its own query)', () => {
    expect(RETURN_PATH).toBe('/payment/result')
  })
})
