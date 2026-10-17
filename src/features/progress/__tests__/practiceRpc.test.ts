import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyFrom, migratedDb } from '@/test/pglite'
import { nextMastery, toMasteryLevel } from '../lib/masteryRules'

// Practice progress is server-written (migrations 20261020000000_progress_rpc.sql and
// 20261020000100_lock_progress_writes.sql), on a real PostgreSQL (PGlite): record_practice_answer()
// follows the app's ±1 rule, pays the mastery coin once and refuses anything but the owner's own
// statements; touch_practised() never changes mastery; and after the lock players can no longer
// write user_progress themselves (the hole this closes: setting a statement to 4/5 through the API
// and collecting its coin with one answer).

const LOCK = '20261020000100_lock_progress_writes.sql'
const OWNER = '11111111-1111-4111-8111-111111111111'
const VISITOR = '22222222-2222-4222-8222-222222222222'
const DECK = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const OTHER_DECK = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const ROOT = 'a0000000-0000-4000-8000-000000000001'
const S1 = 'a0000000-0000-4000-8000-000000000002'
const S2 = 'a0000000-0000-4000-8000-000000000003'
const S3 = 'a0000000-0000-4000-8000-000000000004'
const OTHER_ROOT = 'b0000000-0000-4000-8000-000000000001'
const OTHER_S = 'b0000000-0000-4000-8000-000000000002'

type Answer = { previous_level: number; new_level: number; coins_earned: number; total_coins: number }

let db: PGlite
let canWriteBefore: { ins: boolean; upd: boolean; sel: boolean }

const answer = async (user: string, item: string, correct: boolean) =>
  (await db.query<Answer>(`select * from public.record_practice_answer($1, $2, $3)`, [user, item, correct])).rows[0]
const coins = async (user: string) => (await db.query<{ coins: number }>(`select coins from public.users where id = $1`, [user])).rows[0].coins
const progress = async (user: string) =>
  (
    await db.query<{ knowledge_item_id: string; mastery_level: number; practised: boolean; paid: boolean }>(
      `select knowledge_item_id, mastery_level, last_practiced_at is not null as practised, coin_awarded_at is not null as paid
         from public.user_progress where user_id = $1 order by knowledge_item_id`,
      [user],
    )
  ).rows
const can = async (privilege: string, column?: string) =>
  (
    await db.query<{ ok: boolean }>(
      column ? `select has_column_privilege('authenticated', 'public.user_progress', $2, $1) as ok` : `select has_table_privilege('authenticated', 'public.user_progress', $1) as ok`,
      column ? [privilege, column] : [privilege],
    )
  ).rows[0].ok

beforeAll(async () => {
  db = await migratedDb({ before: LOCK })
  canWriteBefore = { ins: await can('insert', 'mastery_level'), upd: await can('update', 'mastery_level'), sel: await can('select') }
  await applyFrom(db, LOCK)

  await db.query(`insert into auth.users (id, email) values ($1, 'owner@test.dev'), ($2, 'visitor@test.dev')`, [OWNER, VISITOR])
  await db.query(`insert into public.decks (id, user_id, title, slug, is_public) values ($1, $2, 'Sinh học', 'sinh-hoc', true), ($3, $4, 'Vật lý', 'vat-ly', true)`, [DECK, OWNER, OTHER_DECK, VISITOR])
  const node = `insert into public.content_nodes (id, deck_id, parent_id, content, node_type, sort_order) values ($1, $2, $3, $4, $5, $6)`
  await db.query(node, [ROOT, DECK, null, 'Bào quan', 'root', 1])
  await db.query(node, [S1, DECK, ROOT, 'Ty thể sản sinh ATP', 'statement', 1])
  await db.query(node, [S2, DECK, ROOT, 'Lục lạp quang hợp', 'statement', 2])
  await db.query(node, [S3, DECK, ROOT, 'Ribosome tổng hợp protein', 'statement', 3])
  await db.query(node, [OTHER_ROOT, OTHER_DECK, null, 'Khí', 'root', 1])
  await db.query(node, [OTHER_S, OTHER_DECK, OTHER_ROOT, 'Khi nhiệt độ tăng, áp suất khí lớn hơn.', 'statement', 1])
}, 120_000)

describe('record_practice_answer', () => {
  it('moves the level exactly as nextMastery does, in one row, and pays the coin once at 5/5', async () => {
    const start = await coins(OWNER)
    // right ×5 (→ 5/5), right (stays), wrong (→ 4), right (→ 5 again), wrong ×7 (→ 0, stays 0).
    const picks = [true, true, true, true, true, true, false, true, ...Array<boolean>(7).fill(false)]
    let expected = toMasteryLevel(0)
    let paid = 0
    for (const correct of picks) {
      const previous = expected
      expected = nextMastery(previous, correct)
      const row = await answer(OWNER, S1, correct)
      expect([row.previous_level, row.new_level]).toEqual([previous, expected])
      paid += row.coins_earned
      expect(row.total_coins).toBe(start + paid)
    }
    // One coin, on the first 5/5 only (the fifth answer); re-mastering paid nothing.
    expect(paid).toBe(1)
    expect(await coins(OWNER)).toBe(start + 1)
    expect(await progress(OWNER)).toEqual([{ knowledge_item_id: S1, mastery_level: 0, practised: true, paid: true }])
  })

  it('a wrong first answer creates the row at 0/5', async () => {
    expect(await answer(OWNER, S2, false)).toMatchObject({ previous_level: 0, new_level: 0, coins_earned: 0 })
    expect((await progress(OWNER)).find((r) => r.knowledge_item_id === S2)).toEqual({ knowledge_item_id: S2, mastery_level: 0, practised: true, paid: false })
  })

  it("refuses a root, someone else's statement and an unknown id, and saves nothing", async () => {
    const before = await progress(VISITOR)
    await expect(answer(OWNER, ROOT, true)).rejects.toThrow(/ITEM_NOT_FOUND/)
    await expect(answer(VISITOR, S1, true)).rejects.toThrow(/ITEM_NOT_FOUND/)
    await expect(answer(OWNER, OTHER_S, true)).rejects.toThrow(/ITEM_NOT_FOUND/)
    await expect(answer(OWNER, '99999999-9999-4999-8999-999999999999', true)).rejects.toThrow(/ITEM_NOT_FOUND/)
    expect(await progress(VISITOR)).toEqual(before)
    expect((await progress(OWNER)).map((r) => r.knowledge_item_id)).not.toContain(ROOT)
  })
})

describe('touch_practised', () => {
  it("freshens rows and adds missing ones at 0/5, never changes mastery, skips what isn't the gardener's statement", async () => {
    await answer(OWNER, S2, true) // S2 at 1/5
    await db.query(`update public.user_progress set last_practiced_at = '2026-01-01' where user_id = $1`, [OWNER])
    const start = await coins(OWNER)

    const { rows } = await db.query<{ n: number }>(`select public.touch_practised($1, $2::uuid[]) as n`, [OWNER, [S2, S3, S3, ROOT, OTHER_S]])
    expect(rows[0].n).toBe(2)

    const fresh = await db.query<{ knowledge_item_id: string; mastery_level: number; today: boolean }>(
      `select knowledge_item_id, mastery_level, last_practiced_at > now() - interval '1 minute' as today
         from public.user_progress where user_id = $1 order by knowledge_item_id`,
      [OWNER],
    )
    expect(fresh.rows).toEqual([
      { knowledge_item_id: S1, mastery_level: 0, today: false },
      { knowledge_item_id: S2, mastery_level: 1, today: true },
      { knowledge_item_id: S3, mastery_level: 0, today: true },
    ])
    expect(await coins(OWNER)).toBe(start)
  })
})

describe('players cannot write progress themselves', () => {
  it('before the lock they could set mastery_level through the API', () => {
    expect(canWriteBefore).toMatchObject({ ins: true, upd: true })
  })

  it('after it: no insert, update or delete on any column; reading stays', async () => {
    for (const privilege of ['insert', 'update']) {
      expect(await can(privilege), privilege).toBe(false)
      for (const column of ['mastery_level', 'last_practiced_at', 'coin_awarded_at', 'user_id', 'knowledge_item_id']) {
        expect(await can(privilege, column), `${privilege} ${column}`).toBe(false)
      }
    }
    expect(await can('delete')).toBe(false)
    // SELECT is Supabase's default grant (not stubbed here): the lock leaves it as it was.
    expect(await can('select')).toBe(canWriteBefore.sel)
    const { rows } = await db.query<{ cmd: string }>(`select cmd from pg_policies where schemaname = 'public' and tablename = 'user_progress'`)
    expect(rows.map((r) => r.cmd)).toEqual(['SELECT'])
  })

  it('only the service role may call the two functions', async () => {
    const { rows } = await db.query<{ role: string; fn: string; ok: boolean }>(
      `select r.role, f.fn, has_function_privilege(r.role, f.fn, 'execute') as ok
         from (values ('anon'), ('authenticated'), ('service_role')) r(role),
              (values ('public.record_practice_answer(uuid, uuid, boolean)'), ('public.touch_practised(uuid, uuid[])')) f(fn)`,
    )
    expect(rows).toHaveLength(6)
    for (const row of rows) expect(row.ok, `${row.role} ${row.fn}`).toBe(row.role === 'service_role')
  })
})
