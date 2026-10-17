import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyFrom, migratedDb } from '@/test/pglite'

// Payments on a real PostgreSQL (PGlite): migrations 20261021000000_payments.sql and
// 20261022000000_coin_only_payments.sql. Orders are coin packs only, fulfil_order credits the coins
// exactly once, an underpayment is refused, cancel only touches a pending order, and who may do what.

const BUYER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const COIN_ONLY = '20261022000000_coin_only_payments.sql'

let db: PGlite
let next = 1_760_000_000_000_000

type Fulfilled = { fulfilled: boolean; status: string; user_id: string; coins_added: number; total_coins: number }

async function order(amount: number, coins: number, user = BUYER): Promise<number> {
  const code = ++next
  await db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id, coins) values ($1, $2, $3, 'COIN_PACK', $4, $5)`, [code, user, amount, `coins-${coins}`, coins])
  return code
}
const fulfill = async (code: number, paid: number) => (await db.query<Fulfilled>(`select * from public.fulfill_order($1, $2)`, [code, paid])).rows[0]
const coinsOf = async (id = BUYER) => (await db.query<{ coins: number }>(`select coins from public.users where id = $1`, [id])).rows[0].coins
const statusOf = async (code: number) => (await db.query<{ status: string; paid_at: Date | null }>(`select status, paid_at from public.orders where order_code = $1`, [code])).rows[0]

beforeAll(async () => {
  db = await migratedDb()
  await db.query(`insert into auth.users (id, email) values ($1, 'buyer@test.dev'), ($2, 'other@test.dev')`, [BUYER, OTHER])
}, 120_000)

describe('fulfill_order credits coin packs', () => {
  it('adds the pack’s coins once, however many times PayOS calls back', async () => {
    const before = await coinsOf()
    const code = await order(30_000, 50)
    expect(await fulfill(code, 30_000)).toMatchObject({ fulfilled: true, status: 'PAID', coins_added: 50, total_coins: before + 50 })
    expect((await statusOf(code)).paid_at).not.toBeNull()
    // A repeated webhook, then the return page: nothing more.
    expect(await fulfill(code, 30_000)).toMatchObject({ fulfilled: false, coins_added: 0, total_coins: before + 50 })
    expect(await fulfill(code, 30_000)).toMatchObject({ fulfilled: false })
    expect(await coinsOf()).toBe(before + 50)
  })

  it('returns only coin fields (no membership)', async () => {
    const row = await fulfill(await order(10_000, 10), 10_000)
    expect(Object.keys(row).sort()).toEqual(['coins_added', 'fulfilled', 'status', 'total_coins', 'user_id'])
  })

  it('refuses an underpayment and an unknown order, crediting nothing', async () => {
    const before = await coinsOf(OTHER)
    const code = await order(45_000, 100, OTHER)
    await expect(fulfill(code, 10_000)).rejects.toThrow(/AMOUNT_MISMATCH/)
    expect(await statusOf(code)).toMatchObject({ status: 'PENDING' })
    expect(await coinsOf(OTHER)).toBe(before)
    await expect(fulfill(9_999, 1)).rejects.toThrow(/ORDER_NOT_FOUND/)
    // Paying more than the price is still a payment.
    expect(await fulfill(code, 70_000)).toMatchObject({ fulfilled: true, coins_added: 100 })
  })

  it('a cancelled order that PayOS reports paid after all is credited (the money arrived)', async () => {
    const code = await order(10_000, 10)
    expect((await db.query<{ s: string }>(`select public.cancel_order($1) as s`, [code])).rows[0].s).toBe('CANCELLED')
    expect(await fulfill(code, 10_000)).toMatchObject({ fulfilled: true, status: 'PAID' })
  })
})

describe('coin packs only', () => {
  it('no Pro order can be created, and users have no Pro membership column', async () => {
    for (const plan of ['PRO_1M', 'PRO_LIFETIME']) {
      await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id) values ($1, $2, 49000, $3, 'pro')`, [++next, BUYER, plan])).rejects.toThrow(/orders_plan_type_check/)
    }
    const { rows } = await db.query(`select 1 from information_schema.columns where table_name = 'users' and column_name = 'pro_until'`)
    expect(rows).toHaveLength(0)
    const check = await db.query<{ def: string; valid: boolean }>(`select pg_get_constraintdef(oid) as def, convalidated as valid from pg_constraint where conname = 'orders_plan_type_check'`)
    expect(check.rows[0]).toMatchObject({ valid: true })
    expect(check.rows[0].def).toContain("'COIN_PACK'")
  })

  it('on a database that already sold Pro, the past is kept: paid Pro rows stay, pending ones are cancelled, pro_until stays', async () => {
    const old = await migratedDb({ before: COIN_ONLY })
    await old.query(`insert into auth.users (id, email) values ($1, 'pro@test.dev')`, [BUYER])
    await old.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id) values (1, $1, 49000, 'PRO_1M', 'pro-1m'), (2, $1, 49000, 'PRO_1M', 'pro-1m')`, [BUYER])
    await old.query(`select * from public.fulfill_order(1, 49000)`)
    await applyFrom(old, COIN_ONLY)
    const orders = await old.query<{ order_code: number; status: string }>(`select order_code, status from public.orders order by order_code`)
    expect(orders.rows.map((o) => [Number(o.order_code), o.status])).toEqual([
      [1, 'PAID'],
      [2, 'CANCELLED'],
    ])
    // The check holds for new rows (not validated over the old ones).
    expect((await old.query<{ valid: boolean }>(`select convalidated as valid from pg_constraint where conname = 'orders_plan_type_check'`)).rows[0].valid).toBe(false)
    await expect(old.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id) values (3, $1, 49000, 'PRO_1M', 'pro-1m')`, [BUYER])).rejects.toThrow()
    // The gardener's Pro record is not thrown away.
    expect((await old.query(`select 1 from information_schema.columns where table_name = 'users' and column_name = 'pro_until'`)).rows).toHaveLength(1)
    // An old Pro order can't be reopened, and can no longer be fulfilled.
    await expect(old.query(`update public.orders set status = 'PENDING' where order_code = 2`)).rejects.toThrow(/orders_plan_type_check/)
    await expect(old.query(`select * from public.fulfill_order(2, 49000)`)).rejects.toThrow(/NOT_A_COIN_PACK/)
  }, 120_000)
})

describe('cancel_order', () => {
  it('cancels only a pending order and reports the status otherwise', async () => {
    const cancel = async (code: number) => (await db.query<{ s: string | null }>(`select public.cancel_order($1) as s`, [code])).rows[0].s
    expect(await cancel(await order(10_000, 10, OTHER))).toBe('CANCELLED')
    const paid = await order(10_000, 10, OTHER)
    await fulfill(paid, 10_000)
    expect(await cancel(paid)).toBe('PAID')
    expect(await cancel(123)).toBeNull()
  })
})

describe('who may do what', () => {
  it('players read their orders only, write none, and can never set their own coins', async () => {
    const can = async (sql: string, ...args: string[]) => (await db.query<{ ok: boolean }>(sql, args)).rows[0].ok
    for (const p of ['insert', 'update', 'delete']) expect(await can(`select has_table_privilege('authenticated', 'public.orders', $1) as ok`, p), p).toBe(false)
    expect(await can(`select has_column_privilege('authenticated', 'public.users', 'coins', 'update') as ok`)).toBe(false)
    const { rows } = await db.query<{ cmd: string; qual: string }>(`select cmd, qual from pg_policies where tablename = 'orders'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].cmd).toBe('SELECT')
    expect(rows[0].qual).toContain('user_id')
  })

  it('only the service role may call the two functions', async () => {
    const { rows } = await db.query<{ role: string; fn: string; ok: boolean }>(
      `select r.role, f.fn, has_function_privilege(r.role, f.fn, 'execute') as ok
         from (values ('anon'), ('authenticated'), ('service_role')) r(role),
              (values ('public.fulfill_order(bigint, numeric)'), ('public.cancel_order(bigint)')) f(fn)`,
    )
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(row.ok, `${row.role} ${row.fn}`).toBe(row.role === 'service_role')
  })

  it('an order code is unique and stays a JavaScript-safe integer; amounts and coins are positive', async () => {
    const code = await order(10_000, 10)
    await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id, coins) values ($1, $2, 10000, 'COIN_PACK', 'coins-10', 10)`, [code, BUYER])).rejects.toThrow()
    await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id, coins) values (9007199254740992, $1, 1, 'COIN_PACK', 'coins-10', 10)`, [BUYER])).rejects.toThrow()
    await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id, coins) values (5, $1, 0, 'COIN_PACK', 'coins-10', 10)`, [BUYER])).rejects.toThrow()
    await expect(db.query(`insert into public.orders (order_code, user_id, amount, plan_type, product_id) values (6, $1, 100, 'COIN_PACK', 'coins-10')`, [BUYER])).rejects.toThrow()
  })
})
