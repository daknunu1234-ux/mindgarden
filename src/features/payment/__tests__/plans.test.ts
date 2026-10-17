import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { COIN_PACKAGES } from '@/shared/lib/economy'
import { CreatePaymentDto, PaymentStatusDto } from '../dto/PaymentDto'
import { COIN_PRODUCTS, findProduct, makeOrderCode, PAYMENT_PRODUCT_IDS, RETURN_PATH } from '../lib/plans'

const migration = (name: string) => readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', name), 'utf8')
const PAYMENTS = migration('20261021000000_payments.sql')
const COIN_ONLY = migration('20261022000000_coin_only_payments.sql')

describe('the catalogue: coin packs only', () => {
  it('sells exactly the Coin Shop packages, at their shop prices', () => {
    expect(COIN_PRODUCTS.map((p) => [p.id, p.coins, p.amountVnd])).toEqual(COIN_PACKAGES.map((p) => [p.id, p.coins, p.priceVnd]))
    expect(PAYMENT_PRODUCT_IDS).toEqual(['coins-10', 'coins-20', 'coins-50', 'coins-100'])
    for (const p of COIN_PRODUCTS) expect(p.planType).toBe('COIN_PACK')
  })

  it('no Pro membership is sold any more', () => {
    for (const id of ['pro-1m', 'pro-lifetime']) {
      expect(findProduct(id)).toBeUndefined()
      expect(CreatePaymentDto.safeParse({ productId: id }).success).toBe(false)
    }
  })

  it('prices are whole VND above PayOS’s minimum; descriptions fit every bank (9 characters)', () => {
    for (const p of COIN_PRODUCTS) {
      expect(Number.isInteger(p.amountVnd), p.id).toBe(true)
      expect(p.amountVnd, p.id).toBeGreaterThanOrEqual(2000)
      expect(p.coins, p.id).toBeGreaterThan(0)
      expect(p.description.length, p.id).toBeLessThanOrEqual(9)
      expect(p.description).toMatch(/^[A-Z0-9 ]+$/)
    }
  })

  it('matches the migrations: orders take coin packs only, and fulfilling credits coins only', () => {
    expect(PAYMENTS).toContain("check (status in ('PENDING', 'PAID', 'CANCELLED'))")
    expect(COIN_ONLY).toContain("add constraint orders_plan_type_check check (plan_type = 'COIN_PACK')")
    const start = COIN_ONLY.indexOf('create function public.fulfill_order')
    const fulfil = COIN_ONLY.slice(start, COIN_ONLY.indexOf('$$;', start))
    expect(fulfil).toContain('returns table (fulfilled boolean, status text, user_id uuid, coins_added integer, total_coins integer)')
    expect(fulfil).toContain('set coins = u.coins + v_order.coins')
    expect(fulfil).not.toMatch(/pro_until|PRO_1M|PRO_LIFETIME/)
  })

  it('the browser can only name a coin pack; amounts are never accepted', () => {
    expect(CreatePaymentDto.parse({ productId: 'coins-50', amount: 1, coins: 999999 })).toEqual({ productId: 'coins-50' })
    expect(CreatePaymentDto.safeParse({ productId: 'free-stuff' }).success).toBe(false)
    expect(findProduct('coins-50')).toMatchObject({ planType: 'COIN_PACK', coins: 50, amountVnd: 30_000 })
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
    expect(makeOrderCode(now, 8)).not.toBe(a)
    expect(makeOrderCode(now + 1, 0)).toBeGreaterThan(makeOrderCode(now, 999))
    expect(PAYMENTS).toContain('check (order_code > 0 and order_code <= 9007199254740991)')
  })

  it('PayOS returns to a plain path (it appends its own query)', () => {
    expect(RETURN_PATH).toBe('/payment/result')
  })
})
