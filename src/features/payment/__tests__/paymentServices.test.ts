import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The payment services with an in-memory database and a fake PayOS: checkout (POST
// /api/payment/create), the signed webhook, and the return page's reconcile. The SQL itself is tested
// on PostgreSQL in paymentsDb.test.ts.

const BUYER = '11111111-1111-4111-8111-111111111111'

type Order = { order_code: number; user_id: string; amount: number; status: 'PENDING' | 'PAID' | 'CANCELLED'; plan_type: string; product_id: string; coins: number; payment_link_id?: string | null }
const db = {
  orders: [] as Order[],
  users: new Map<string, { coins: number; pro_until: string | null }>(),
  insertErrors: [] as { code: string; message: string }[],
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  admin: true,
  user: BUYER as string | null,
}

vi.mock('@/shared/lib/supabase/requestUser', () => ({ getRequestUser: async () => (db.user ? { id: db.user } : null) }))

// Service role: orders insert / update and the two functions with their SQL semantics.
vi.mock('@/shared/lib/supabase/admin', () => ({
  createAdminClient: () =>
    db.admin
      ? {
          from: () => ({
            insert: async (row: Omit<Order, 'status'>) => {
              const error = db.insertErrors.shift()
              if (error) return { error }
              db.orders.push({ status: 'PENDING', ...row })
              return { error: null }
            },
            update: (patch: Partial<Order>) => ({
              eq: async (_col: string, code: number) => {
                Object.assign(db.orders.find((o) => o.order_code === code) ?? {}, patch)
                return { error: null }
              },
            }),
          }),
          rpc: async (fn: string, args: { p_order_code: number; p_amount_paid?: number }) => {
            db.rpc.push({ fn, args })
            const order = db.orders.find((o) => o.order_code === args.p_order_code)
            if (fn === 'cancel_order') {
              if (order?.status === 'PENDING') order.status = 'CANCELLED'
              return { data: order?.status ?? null, error: null }
            }
            if (!order) return { data: null, error: { code: 'P0002', message: 'ORDER_NOT_FOUND' } }
            const user = db.users.get(order.user_id)!
            if (order.status === 'PAID') return { data: [{ fulfilled: false, status: 'PAID', user_id: order.user_id, plan_type: order.plan_type, coins_added: 0, total_coins: user.coins, pro_until: user.pro_until }], error: null }
            if ((args.p_amount_paid ?? 0) < order.amount) return { data: null, error: { code: 'P0001', message: 'AMOUNT_MISMATCH' } }
            order.status = 'PAID'
            if (order.plan_type === 'COIN_PACK') user.coins += order.coins
            else user.pro_until = order.plan_type === 'PRO_LIFETIME' ? 'infinity' : '2026-11-16T10:00:00+00:00'
            return { data: [{ fulfilled: true, status: 'PAID', user_id: order.user_id, plan_type: order.plan_type, coins_added: order.plan_type === 'COIN_PACK' ? order.coins : 0, total_coins: user.coins, pro_until: user.pro_until }], error: null }
          },
        }
      : null,
}))

import { setPayOSForTests } from '../services/payos'
import { httpStatusOf, startCheckout } from '../services/checkout'
import { readPaymentStatus } from '../services/orders'
import { handlePayOSWebhook } from '../services/webhook'

// A fake PayOS: records the payment links it creates, verifies a signature it knows, and reports a
// link's status.
const payos = {
  created: [] as Record<string, unknown>[],
  failCreate: false,
  linkStatus: new Map<number, { status: string; amountPaid: number }>(),
  paymentRequests: {
    create: vi.fn(async (req: { orderCode: number; amount: number; description: string }) => {
      if (payos.failCreate) throw new Error('PayOS: 20 Invalid data')
      payos.created.push(req)
      return {
        bin: '970422',
        accountNumber: '0123456789',
        accountName: 'MINDGARDEN',
        amount: req.amount,
        description: req.description,
        orderCode: req.orderCode,
        currency: 'VND',
        paymentLinkId: `link-${req.orderCode}`,
        status: 'PENDING',
        expiredAt: 1_760_700_000,
        checkoutUrl: `https://pay.payos.vn/web/link-${req.orderCode}`,
        qrCode: `00020101021238570010A000000727…${req.orderCode}`,
      }
    }),
    get: vi.fn(async (orderCode: number) => {
      const link = payos.linkStatus.get(orderCode)
      if (!link) throw new Error('not found')
      return { id: 'x', orderCode, amount: link.amountPaid, amountPaid: link.amountPaid, amountRemaining: 0, status: link.status, createdAt: '', transactions: [], cancellationReason: null, canceledAt: null }
    }),
  },
  webhooks: {
    verify: vi.fn(async (body: { signature: string; data: Record<string, unknown> }) => {
      if (body.signature !== 'valid-signature') throw new Error('Data not integrity')
      return body.data
    }),
  },
}

// The buyer's own session (RLS): their orders and their users row.
function userClient() {
  return {
    from: (table: string) => {
      const filters: Record<string, unknown> = {}
      const q = {
        select: () => q,
        eq: (col: string, value: unknown) => {
          filters[col] = value
          return q
        },
        maybeSingle: async () => {
          if (table === 'users') return { data: db.users.get(filters.id as string) ?? null, error: null }
          return { data: db.orders.find((o) => o.order_code === filters.order_code && o.user_id === filters.user_id) ?? null, error: null }
        },
      }
      return q
    },
  } as never
}

const webhook = (orderCode: number, amount: number, { code = '00', signature = 'valid-signature' } = {}) => ({
  code,
  desc: 'success',
  success: code === '00',
  signature,
  data: { orderCode, amount, description: 'MG C50', accountNumber: '0123456789', reference: 'FT123', transactionDateTime: '2026-10-17 10:00:00', currency: 'VND', paymentLinkId: `link-${orderCode}`, code, desc: 'success' },
})

beforeEach(() => {
  db.orders = []
  db.users = new Map([[BUYER, { coins: 300, pro_until: null }]])
  db.insertErrors = []
  db.rpc = []
  db.admin = true
  db.user = BUYER
  payos.created = []
  payos.failCreate = false
  payos.linkStatus = new Map()
  setPayOSForTests(payos as never)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('POST /api/payment/create (startCheckout)', () => {
  it('prices the order from the catalogue, stores it PENDING and returns PayOS’s checkout and VietQR', async () => {
    const res = await startCheckout({ productId: 'coins-50', amount: 1 }, 'http://localhost:3000')
    expect(res.success).toBe(true)
    if (!res.success) return
    expect(res.data).toMatchObject({ productId: 'coins-50', amount: 40_000, description: 'MG C50', accountName: 'MINDGARDEN', bin: '970422' })
    expect(res.data.checkoutUrl).toMatch(/^https:\/\/pay\.payos\.vn\//)
    expect(res.data.qrCode).toContain(String(res.data.orderCode))
    expect(db.orders).toEqual([expect.objectContaining({ order_code: res.data.orderCode, user_id: BUYER, amount: 40_000, status: 'PENDING', plan_type: 'COIN_PACK', product_id: 'coins-50', coins: 50, payment_link_id: `link-${res.data.orderCode}` })])
    expect(payos.created[0]).toMatchObject({
      orderCode: res.data.orderCode,
      amount: 40_000,
      description: 'MG C50',
      returnUrl: 'http://localhost:3000/payment/result',
      cancelUrl: 'http://localhost:3000/payment/result',
      items: [{ name: '50 coins', quantity: 1, price: 40_000 }],
    })
    expect(httpStatusOf(res)).toBe(200)
  })

  it('a Pro month and lifetime carry no coins', async () => {
    await startCheckout({ productId: 'pro-1m' }, 'https://mindgarden.vn')
    await startCheckout({ productId: 'pro-lifetime' }, 'https://mindgarden.vn')
    expect(db.orders.map((o) => [o.plan_type, o.amount, o.coins])).toEqual([
      ['PRO_1M', 49_000, 0],
      ['PRO_LIFETIME', 499_000, 0],
    ])
  })

  it('retries a colliding order code', async () => {
    db.insertErrors.push({ code: '23505', message: 'duplicate key' })
    const res = await startCheckout({ productId: 'pro-1m' }, 'http://localhost:3000')
    expect(res.success).toBe(true)
    expect(db.orders).toHaveLength(1)
  })

  it('refuses a signed-out buyer (401), an unknown product (400), and answers 503 when PayOS isn’t set up', async () => {
    db.user = null
    const signedOut = await startCheckout({ productId: 'pro-1m' }, 'http://x')
    expect(signedOut).toMatchObject({ success: false, error: { code: 'AUTH_UNAUTHORIZED' } })
    expect(httpStatusOf(signedOut)).toBe(401)
    db.user = BUYER
    const unknown = await startCheckout({ productId: 'everything-free' }, 'http://x')
    expect(httpStatusOf(unknown)).toBe(400)
    setPayOSForTests(null)
    const off = await startCheckout({ productId: 'pro-1m' }, 'http://x')
    expect(off).toMatchObject({ success: false, error: { code: 'PAYMENT_UNAVAILABLE' } })
    expect(httpStatusOf(off)).toBe(503)
    expect(db.orders).toHaveLength(0)
  })

  it('cancels the order when PayOS refuses to create the link (502)', async () => {
    payos.failCreate = true
    const res = await startCheckout({ productId: 'coins-10' }, 'http://x')
    expect(res).toMatchObject({ success: false, error: { code: 'PAYMENT_FAILED' } })
    expect(httpStatusOf(res)).toBe(502)
    expect(db.orders[0].status).toBe('CANCELLED')
  })
})

describe('POST /api/payment/webhook (handlePayOSWebhook)', () => {
  async function pendingOrder(productId = 'coins-50') {
    const res = await startCheckout({ productId }, 'http://x')
    if (!res.success) throw new Error('no order')
    return res.data.orderCode
  }

  it('a signed successful payment fulfils the order once; PayOS retries add nothing', async () => {
    const code = await pendingOrder()
    expect(await handlePayOSWebhook(webhook(code, 40_000))).toEqual({ status: 200, body: { success: true, message: 'Order fulfilled' } })
    expect(db.users.get(BUYER)!.coins).toBe(350)
    expect(await handlePayOSWebhook(webhook(code, 40_000))).toEqual({ status: 200, body: { success: true, message: 'Order already fulfilled' } })
    expect(db.users.get(BUYER)!.coins).toBe(350)
  })

  it('a Pro order upgrades the account', async () => {
    const code = await pendingOrder('pro-lifetime')
    await handlePayOSWebhook(webhook(code, 499_000))
    expect(db.users.get(BUYER)!.pro_until).toBe('infinity')
  })

  it('an unsigned or tampered call is refused with 400 and changes nothing', async () => {
    const code = await pendingOrder()
    expect(await handlePayOSWebhook(webhook(code, 40_000, { signature: 'forged' }))).toMatchObject({ status: 400, body: { message: 'Invalid signature' } })
    expect(await handlePayOSWebhook({ hello: 'world' })).toMatchObject({ status: 400 })
    expect(db.orders[0].status).toBe('PENDING')
    expect(db.users.get(BUYER)!.coins).toBe(300)
    expect(db.rpc.filter((c) => c.fn === 'fulfill_order')).toHaveLength(0)
  })

  it('only code 00 counts: a failed payment notice is acknowledged and ignored', async () => {
    const code = await pendingOrder()
    expect(await handlePayOSWebhook(webhook(code, 40_000, { code: '01' }))).toMatchObject({ status: 200, body: { message: 'Ignored: not a successful payment' } })
    expect(db.orders[0].status).toBe('PENDING')
  })

  it('PayOS’s confirmation call (an unknown order) and an underpayment are acknowledged without granting', async () => {
    expect(await handlePayOSWebhook(webhook(123, 3000))).toMatchObject({ status: 200, body: { message: 'Unknown order' } })
    const code = await pendingOrder()
    expect(await handlePayOSWebhook(webhook(code, 1000))).toMatchObject({ status: 200, body: { message: 'Amount does not match the order' } })
    expect(db.users.get(BUYER)!.coins).toBe(300)
  })

  it('answers 503 without PayOS, and 500 (PayOS retries) when the database can’t be reached', async () => {
    setPayOSForTests(null)
    expect((await handlePayOSWebhook(webhook(1, 1))).status).toBe(503)
    setPayOSForTests(payos as never)
    db.admin = false
    expect((await handlePayOSWebhook(webhook(1, 1))).status).toBe(500)
  })
})

describe('the return page settles a pending order from PayOS (readPaymentStatus)', () => {
  it('PayOS says paid: the order is fulfilled and the buyer sees their new purse', async () => {
    const res = await startCheckout({ productId: 'coins-100' }, 'http://x')
    if (!res.success) throw new Error()
    payos.linkStatus.set(res.data.orderCode, { status: 'PAID', amountPaid: 68_000 })
    const status = await readPaymentStatus(userClient(), BUYER, res.data.orderCode, new Date('2026-10-17T10:00:00Z'))
    expect(status).toMatchObject({ success: true, data: { status: 'PAID', coins: 100, totalCoins: 400, planType: 'COIN_PACK', membership: { isPro: false } } })
  })

  it('PayOS says cancelled or expired: the order is cancelled; still pending: left pending', async () => {
    const a = await startCheckout({ productId: 'pro-1m' }, 'http://x')
    const b = await startCheckout({ productId: 'pro-1m' }, 'http://x')
    if (!a.success || !b.success) throw new Error()
    payos.linkStatus.set(a.data.orderCode, { status: 'EXPIRED', amountPaid: 0 })
    payos.linkStatus.set(b.data.orderCode, { status: 'PENDING', amountPaid: 0 })
    expect(await readPaymentStatus(userClient(), BUYER, a.data.orderCode)).toMatchObject({ data: { status: 'CANCELLED' } })
    expect(await readPaymentStatus(userClient(), BUYER, b.data.orderCode)).toMatchObject({ data: { status: 'PENDING' } })
  })

  it('a Pro order reads back the membership; someone else’s order is not found', async () => {
    const res = await startCheckout({ productId: 'pro-1m' }, 'http://x')
    if (!res.success) throw new Error()
    await handlePayOSWebhook(webhook(res.data.orderCode, 49_000))
    expect(await readPaymentStatus(userClient(), BUYER, res.data.orderCode, new Date('2026-10-17T10:00:00Z'))).toMatchObject({ data: { status: 'PAID', membership: { isPro: true, lifetime: false } } })
    expect(await readPaymentStatus(userClient(), '99999999-9999-4999-8999-999999999999', res.data.orderCode)).toMatchObject({ success: false, error: { code: 'ORDER_NOT_FOUND' } })
  })

  it('PayOS unreachable: the database’s status is reported as it is', async () => {
    const res = await startCheckout({ productId: 'pro-1m' }, 'http://x')
    if (!res.success) throw new Error()
    expect(await readPaymentStatus(userClient(), BUYER, res.data.orderCode)).toMatchObject({ data: { status: 'PENDING' } })
  })
})

describe('the route handlers stay thin', () => {
  const read = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', '..', 'app', 'api', 'payment', ...parts), 'utf8')
  it('create and webhook delegate to the feature’s server API and never query Supabase themselves', () => {
    const create = read('create', 'route.ts')
    const hook = read('webhook', 'route.ts')
    expect(create).toContain("from '@/features/payment/server'")
    expect(create).toContain('startCheckout(body, request.nextUrl.origin)')
    expect(hook).toContain('handlePayOSWebhook(body)')
    for (const src of [create, hook]) expect(src).not.toMatch(/supabase|\.from\(|\.rpc\(/)
  })
})
