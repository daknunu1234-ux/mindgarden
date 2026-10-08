import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, migratedDb } from '@/test/pglite'
import { canClone, CLONE_CREATOR_REWARD, CLONE_MIN_STATEMENTS, cloneButtonState, cloneCost, cloneRequirementLabel } from '@/shared/lib/economy'
import { seedPrice } from '@/shared/lib/treeSkins'

// Tree cloning (migration 20261019000000_clone_rewards.sql) on a real PostgreSQL (PGlite, every
// migration applied): the 50-statement gate, the dynamic price charged to the cloner, exactly +50 🪙
// for the tree's creator, the clone log, the creator's notification, no self-cloning, and several
// clones in a row.

const OWNER = '11111111-1111-4111-8111-111111111111'
const CLONER = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'
const MIGRATION = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261019000000_clone_rewards.sql'), 'utf8')

let db: PGlite
let slugs = 0
const one = async <T,>(sql: string, params: unknown[] = []): Promise<T> => (await db.query<T>(sql, params)).rows[0]
const count = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(`select count(*)::int as n from ${sql}`, params)).n)
const coins = async (id: string) => Number((await one<{ coins: number }>(`select coins from public.users where id = $1`, [id])).coins)
const setCoins = (id: string, n: number) => db.query(`update public.users set coins = $2 where id = $1`, [id, n])

// A shared tree of `statements` statements under one root (written as the database itself would).
async function tree(owner: string, statements: number, { title = 'Cell Biology', species = 'oak', shared = true } = {}) {
  await asUser(db, null)
  const deck = (await one<{ id: string }>(`insert into public.decks (user_id, title, slug, is_public, tree_type) values ($1, $2, $3, $4, $5) returning id`, [owner, title, `tree-${slugs++}`, shared, species])).id
  const root = (await one<{ id: string }>(`insert into public.content_nodes (deck_id, parent_id, content, node_type, sort_order) values ($1, null, 'Root', 'root', 0) returning id`, [deck])).id
  for (let i = 0; i < statements; i++) {
    await db.query(`insert into public.content_nodes (deck_id, parent_id, content, node_type, sort_order) values ($1, $2, $3, 'statement', $4)`, [deck, root, `Statement ${i + 1}.`, i + 1])
  }
  return deck
}
const clone = async (cloner: string, deck: string) => {
  await asUser(db, cloner)
  return one<{ deck_id: string; remaining_coins: number; cost: number }>(`select * from public.clone_deck($1, $2)`, [deck, `copy-${slugs++}`])
}

beforeAll(async () => {
  db = await migratedDb()
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@test.dev'), ($2, 'cloner@test.dev'), ($3, 'other@test.dev')`, [OWNER, CLONER, OTHER])
}, 120_000)

beforeEach(async () => {
  await asUser(db, null)
  await db.query(`delete from public.notifications`)
  await db.query(`delete from public.plant_clones`)
  await db.query(`delete from public.decks`)
  for (const id of [OWNER, CLONER, OTHER]) await setCoins(id, 1000)
})

describe('the quality gate: at least 50 statements', () => {
  it('rejects a tree with fewer than 50 statements, and charges and pays nobody', async () => {
    const small = await tree(OWNER, 49)
    await expect(clone(CLONER, small)).rejects.toThrow(/CLONE_TOO_SMALL/)
    expect(await coins(CLONER)).toBe(1000)
    expect(await coins(OWNER)).toBe(1000)
    expect(await count(`public.decks where user_id = $1`, [CLONER])).toBe(0)
    expect(await count(`public.plant_clones`)).toBe(0)
    expect(await count(`public.notifications`)).toBe(0)
  })

  it('accepts exactly 50', async () => {
    const deck = await tree(OWNER, 50)
    expect((await clone(CLONER, deck)).cost).toBe(100 + 50)
  })
})

describe('paying for a clone', () => {
  it('rejects a purse short of the fee: nothing changes on either side', async () => {
    const deck = await tree(OWNER, 52)
    await setCoins(CLONER, 149)
    await expect(clone(CLONER, deck)).rejects.toThrow(/INSUFFICIENT_COINS/)
    expect(await coins(CLONER)).toBe(149)
    expect(await coins(OWNER)).toBe(1000)
    expect(await count(`public.decks where user_id = $1`, [CLONER])).toBe(0)
    expect(await count(`public.plant_clones`)).toBe(0)
  })

  it('charges the cloner the dynamic price and pays the creator exactly 50 coins; logs it and notifies the creator', async () => {
    const deck = await tree(OWNER, 52, { title: 'Cell Biology' })
    const res = await clone(CLONER, deck)
    const price = cloneCost(52, seedPrice('oak'))
    expect(price).toBe(150)
    expect(res.cost).toBe(price)
    expect(res.remaining_coins).toBe(1000 - price)
    expect(await coins(CLONER)).toBe(1000 - price)
    expect(await coins(OWNER)).toBe(1000 + 50)
    // The copy: the cloner's, private, every statement.
    expect(await one(`select user_id, is_public from public.decks where id = $1`, [res.deck_id])).toEqual({ user_id: CLONER, is_public: false })
    expect(await count(`public.content_nodes where deck_id = $1 and node_type = 'statement'`, [res.deck_id])).toBe(52)
    // The log.
    expect(await one(`select source_deck_id, clone_deck_id, cloner_id, owner_id, statements, cost, owner_reward from public.plant_clones`)).toEqual({
      source_deck_id: deck,
      clone_deck_id: res.deck_id,
      cloner_id: CLONER,
      owner_id: OWNER,
      statements: 52,
      cost: 150,
      owner_reward: 50,
    })
    // The creator's notice.
    expect(await one(`select user_id, kind, message, read_at from public.notifications`)).toEqual({
      user_id: OWNER,
      kind: 'tree_cloned',
      message: "🎉 A player cloned your tree 'Cell Biology'! You earned +50 🪙",
      read_at: null,
    })
  })

  it('a surreal species costs more to clone; the creator still earns exactly 50', async () => {
    const deck = await tree(OWNER, 80, { species: 'crystal_flora' })
    const res = await clone(CLONER, deck)
    expect(res.cost).toBe(cloneCost(80, seedPrice('crystal_flora')))
    expect(res.cost).toBe(180 + 50)
    expect(await coins(OWNER)).toBe(1000 + 50)
  })
})

describe('who may clone what', () => {
  it('nobody clones their own tree', async () => {
    const deck = await tree(OWNER, 60)
    await expect(clone(OWNER, deck)).rejects.toThrow(/CANNOT_CLONE_OWN_DECK/)
    expect(await coins(OWNER)).toBe(1000)
  })

  it('a private tree is not cloneable', async () => {
    const deck = await tree(OWNER, 60, { shared: false })
    await expect(clone(CLONER, deck)).rejects.toThrow(/DECK_NOT_FOUND/)
  })

  it('several clones in a row, while the purse covers them; each pays its creator', async () => {
    const first = await tree(OWNER, 55, { title: 'First' })
    const second = await tree(OTHER, 70, { title: 'Second' })
    // Exactly three clones' worth (150 each).
    await setCoins(CLONER, 450)
    await clone(CLONER, first)
    await clone(CLONER, second)
    // The same tree again is a new copy (and a new reward).
    await clone(CLONER, first)
    expect(await coins(CLONER)).toBe(0)
    expect(await coins(OWNER)).toBe(1000 + 2 * 50)
    expect(await coins(OTHER)).toBe(1000 + 50)
    expect(await count(`public.plant_clones where cloner_id = $1`, [CLONER])).toBe(3)
    expect(await count(`public.notifications where user_id = $1`, [OWNER])).toBe(2)
    // The purse is empty now: a fourth is refused.
    await expect(clone(CLONER, second)).rejects.toThrow(/INSUFFICIENT_COINS/)
    expect(await coins(OTHER)).toBe(1000 + 50)
  })
})

describe('the rules are the same everywhere', () => {
  it('the database uses the shared constants; the migration secures its tables', () => {
    expect(CLONE_MIN_STATEMENTS).toBe(50)
    expect(CLONE_CREATOR_REWARD).toBe(50)
    expect(MIGRATION).toContain(`v_reward constant integer := ${CLONE_CREATOR_REWARD};  -- CLONE_CREATOR_REWARD`)
    expect(MIGRATION).toContain(`v_min    constant integer := ${CLONE_MIN_STATEMENTS};  -- CLONE_MIN_STATEMENTS`)
    expect(MIGRATION).toMatch(/alter table public\.plant_clones enable row level security/)
    expect(MIGRATION).toMatch(/alter table public\.notifications enable row level security/)
    expect(MIGRATION).toMatch(/grant update \(read_at\) on public\.notifications to authenticated/)
    // Both purses are locked in id order.
    expect(MIGRATION).toMatch(/where u\.id in \(v_user, v_source\.user_id\) order by u\.id for update/)
  })

  it('the clone button: the requirement tag and its states', () => {
    expect(cloneRequirementLabel(52)).toBe('🌱 52/50 Statements')
    expect(cloneRequirementLabel(12)).toBe('🌱 12/50 Statements')
    expect([49, 50, 51].map(canClone)).toEqual([false, true, true])
    expect(cloneButtonState(12, 1000, 150)).toBe('too-small')
    expect(cloneButtonState(52, 100, 150)).toBe('short')
    expect(cloneButtonState(52, 150, 150)).toBe('ready')
    expect(cloneButtonState(52, null, 150)).toBe('ready') // unknown purse: the server decides
  })
})
