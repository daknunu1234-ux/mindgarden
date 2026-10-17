import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { migratedDb } from '@/test/pglite'

// Migration 20261021000000_payments.sql on a real PostgreSQL (PGlite): orders, fulfil exactly once,
// coins and Pro granted, underpayment refused, cancel only a pending order, and who may do what.

const BUYER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'

let db: PGlite
let next = 1_760_000_000_000_000

type Fulfilled = { fulfilled: boolean; status: string; user_id: string; plan_type: string; coins_added: number; total_coins: number; pro_until: string | null }

async function order(plan: 'PRO_1M' | 'PRO_LIFETIME' | 'COIN_PACK', amount: number, coins = 0, user = BUYER): Promise<number> {
  const code = ++next
  await db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id, coins) values ($1, $2, $3, $4, $5, $6)`, [code, user, amount, plan, plan.toLowerCase(), coins])
  return code
}
const fulfill = async (code: number, paid: number) => (await db.query<Fulfilled>(`select * from public.fulfill_order($1, $2)`, [code, paid])).rows[0]
const buyer = async (id = BUYER) => (await db.query<{ coins: number; pro_until: Date | number | null }>(`select coins, pro_until from public.users where id = $1`, [id])).rows[0]
const statusOf = async (code: number) => (await db.query<{ status: string; paid_at: Date | null }>(`select status, paid_at from public.orders where order_code = $1`, [code])).rows[0]

beforeAll(async () => {
  db = await migratedDb()
  await db.query(`insert into auth.users (id, email) values ($1, 'buyer@test.dev'), ($2, 'other@test.dev')`, [BUYER, OTHER])
}, 120_000)

describe('fulfill_order', () => {
  it('a coin pack adds its coins once, however many times PayOS calls back', async () => {
    const before = (await buyer()).coins
    const code = await order('COIN_PACK', 40_000, 50)
    expect(await fulfill(code, 40_000)).toMatchObject({ fulfilled: true, status: 'PAID', plan_type: 'COIN_PACK', coins_added: 50, total_coins: before + 50 })
    expect(await statusOf(code)).toMatchObject({ status: 'PAID' })
    expect((await statusOf(code)).paid_at).not.toBeNull()
    // A repeated webhook, then the return page: nothing more.
    expect(await fulfill(code, 40_000)).toMatchObject({ fulfilled: false, coins_added: 0, total_coins: before + 50 })
    expect(await fulfill(code, 40_000)).toMatchObject({ fulfilled: false })
    expect((await buyer()).coins).toBe(before + 50)
  })

  it('a month of Pro adds 30 days, from today or from the end of the current month', async () => {
    const first = await fulfill(await order('PRO_1M', 49_000), 49_000)
    expect(first.fulfilled).toBe(true)
    const end1 = new Date(first.pro_until!).getTime()
    expect(end1 - Date.now()).toBeGreaterThan(29.9 * 864e5)
    expect(end1 - Date.now()).toBeLessThan(30.1 * 864e5)
    const second = await fulfill(await order('PRO_1M', 49_000), 49_000)
    expect(new Date(second.pro_until!).getTime() - end1).toBeCloseTo(30 * 864e5, -5)
  })

  it('lifetime Pro never ends, and a later month leaves it lifetime', async () => {
    await fulfill(await order('PRO_LIFETIME', 499_000), 499_000)
    const { rows } = await db.query<{ forever: boolean }>(`select pro_until = 'infinity'::timestamptz as forever from public.users where id = $1`, [BUYER])
    expect(rows[0].forever).toBe(true)
    await fulfill(await order('PRO_1M', 49_000), 49_000)
    expect((await db.query<{ forever: boolean }>(`select pro_until = 'infinity'::timestamptz as forever from public.users where id = $1`, [BUYER])).rows[0].forever).toBe(true)
  })

  it('refuses an underpayment and an unknown order, granting nothing', async () => {
    const before = await buyer(OTHER)
    const code = await order('COIN_PACK', 68_000, 100, OTHER)
    await expect(fulfill(code, 10_000)).rejects.toThrow(/AMOUNT_MISMATCH/)
    expect(await statusOf(code)).toMatchObject({ status: 'PENDING' })
    expect(await buyer(OTHER)).toEqual(before)
    await expect(fulfill(9_999, 1)).rejects.toThrow(/ORDER_NOT_FOUND/)
    // Paying more than the price is still a payment.
    expect(await fulfill(code, 70_000)).toMatchObject({ fulfilled: true, coins_added: 100 })
  })

  it('a cancelled order that PayOS reports paid after all is fulfilled (the money arrived)', async () => {
    const code = await order('COIN_PACK', 10_000, 10)
    expect((await db.query<{ s: string }>(`select public.cancel_order($1) as s`, [code])).rows[0].s).toBe('CANCELLED')
    expect(await fulfill(code, 10_000)).toMatchObject({ fulfilled: true, status: 'PAID' })
  })
})

describe('cancel_order', () => {
  it('cancels only a pending order and reports the status otherwise', async () => {
    const pending = await order('PRO_1M', 49_000, 0, OTHER)
    const cancel = async (code: number) => (await db.query<{ s: string | null }>(`select public.cancel_order($1) as s`, [code])).rows[0].s
    expect(await cancel(pending)).toBe('CANCELLED')
    const paid = await order('COIN_PACK', 10_000, 10, OTHER)
    await fulfill(paid, 10_000)
    expect(await cancel(paid)).toBe('PAID')
    expect(await statusOf(paid)).toMatchObject({ status: 'PAID' })
    expect(await cancel(123)).toBeNull()
  })
})

describe('who may do what', () => {
  it('players read their orders only, write none, and can never set their own Pro or coins', async () => {
    const can = async (sql: string, ...args: string[]) => (await db.query<{ ok: boolean }>(sql, args)).rows[0].ok
    for (const p of ['insert', 'update', 'delete']) expect(await can(`select has_table_privilege('authenticated', 'public.orders', $1) as ok`, p), p).toBe(false)
    expect(await can(`select has_column_privilege('authenticated', 'public.users', 'pro_until', 'update') as ok`)).toBe(false)
    expect(await can(`select has_column_privilege('authenticated', 'public.users', 'coins', 'update') as ok`)).toBe(false)
    const { rows } = await db.query<{ cmd: string; qual: string }>(`select cmd, qual from pg_policies where tablename = 'orders'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].cmd).toBe('SELECT')
    expect(rows[0].qual).toContain('user_id')
    const rls = await db.query<{ on: boolean }>(`select relrowsecurity as on from pg_class where oid = 'public.orders'::regclass`)
    expect(rls.rows[0].on).toBe(true)
  })

  it('only the service role may call the two functions', async () => {
    const { rows } = await db.query<{ role: string; fn: string; ok: boolean }>(
      `select r.role, f.fn, has_function_privilege(r.role, f.fn, 'execute') as ok
         from (values ('anon'), ('authenticated'), ('service_role')) r(role),
              (values ('public.fulfill_order(bigint, numeric)'), ('public.cancel_order(bigint)')) f(fn)`,
    )
    for (const row of rows) expect(row.ok, `${row.role} ${row.fn}`).toBe(row.role === 'service_role')
  })

  it('an order code is unique and stays a JavaScript-safe integer; amounts are positive', async () => {
    const code = await order('COIN_PACK', 10_000, 10)
    await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id, coins) values ($1, $2, 10000, 'COIN_PACK', 'coins-10', 10)`, [code, BUYER])).rejects.toThrow()
    await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id) values (9007199254740992, $1, 1, 'PRO_1M', 'pro-1m')`, [BUYER])).rejects.toThrow()
    await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id) values (5, $1, 0, 'PRO_1M', 'pro-1m')`, [BUYER])).rejects.toThrow()
    await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id) values (6, $1, 100, 'COIN_PACK', 'coins-10')`, [BUYER])).rejects.toThrow()
  })
})
