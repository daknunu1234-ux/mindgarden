import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, migratedDb } from '@/test/pglite'

// Migration 20261015000000_rail_logistics.sql on a real PostgreSQL (PGlite, every migration applied):
// track prices, trains on tracks, fruit from harvests, candy, and the freight link's payout.

const OWNER = '11111111-1111-4111-8111-111111111111'
let db: PGlite
const one = async <T,>(sql: string, params: unknown[] = []): Promise<T> => (await db.query<T>(sql, params)).rows[0]
const buy = (type: string, x: number, y: number) => db.query(`select * from public.purchase_and_place_item($1, $2, $3)`, [type, x, y])
const coins = async () => Number((await one<{ coins: number }>(`select coins from public.users where id = $1`, [OWNER])).coins)
const idOf = async (type: string, x: number, y: number) =>
  (await one<{ id: string }>(`select id from public.garden_placements where user_id = $1 and item_type = $2 and grid_x = $3 and grid_y = $4`, [OWNER, type, x, y])).id
const rewind = (hours: number) =>
  db.query(`update public.farm_economy set last_tick_at = now() - make_interval(secs => $2::double precision * 3600) where user_id = $1`, [OWNER, hours])
type Settled = { fruit: string; candy: string; candy_shipped: number; candy_payout: number; total_coins: number }
const settle = () => one<Settled>(`select * from public.settle_farm_economy()`)
const setStock = (fruit: number, candy = 0) =>
  db.query(`insert into public.farm_economy (user_id, fruit, candy) values ($1, $2, $3) on conflict (user_id) do update set fruit = $2, candy = $3, last_tick_at = now()`, [OWNER, fruit, candy])
// A line of track from (x0, y) to (x1, y), or down a column.
const trackRow = async (y: number, x0: number, x1: number) => {
  for (let x = x0; x <= x1; x++) await buy('rail_track', x, y)
}
const trackCol = async (x: number, y0: number, y1: number) => {
  for (let y = y0; y <= y1; y++) await buy('rail_track', x, y)
}

beforeAll(async () => {
  db = await migratedDb()
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@test.dev')`, [OWNER])
}, 120_000)

beforeEach(async () => {
  await asUser(db, null)
  await db.query(`delete from public.garden_placements where user_id = $1 and item_type = 'freight_train'`, [OWNER])
  await db.query(`delete from public.garden_placements where user_id = $1`, [OWNER])
  await db.query(`delete from public.farm_economy where user_id = $1`, [OWNER])
  await db.query(`update public.users set coins = 1000 where id = $1`, [OWNER])
  await asUser(db, OWNER)
})

describe('prices and placement', () => {
  it('charges today’s prices: a track 1 coin per tile, the rest as the catalogue says', async () => {
    await trackRow(5, 0, 9)
    expect(await coins()).toBe(1000 - 10)
    await buy('windmill_small', 0, 0)
    await buy('windmill_large', 10, 0)
    await buy('furniture_factory', 3, 0)
    await buy('candy_factory', 6, 0)
    await buy('seaport', 0, 14)
    expect(await coins()).toBe(990 - 30 - 60 - 50 - 50 - 100)
  })

  it('a Freight Train (1 × 3) stands only on three tracks, and costs 30', async () => {
    await expect(buy('freight_train', 4, 4)).rejects.toThrow(/NOT_ON_TRACK/)
    await trackCol(4, 4, 5)
    await expect(buy('freight_train', 4, 4)).rejects.toThrow(/NOT_ON_TRACK/)
    await buy('rail_track', 4, 6)
    await buy('freight_train', 4, 4)
    expect(await coins()).toBe(1000 - 3 - 30)
    const row = await one(`select width, height from public.garden_placements where item_type = 'freight_train'`)
    expect(row).toEqual({ width: 1, height: 3 })
    // Nothing else can go on a train's tiles; another train neither.
    await expect(buy('rockery', 4, 5)).rejects.toThrow(/TILE_UNAVAILABLE/)
    await expect(buy('freight_train', 4, 4)).rejects.toThrow(/TILE_UNAVAILABLE/)
  })

  it('a track under a train can be neither moved nor picked up; a free one can', async () => {
    await trackCol(2, 2, 5)
    await buy('freight_train', 2, 2)
    const under = await idOf('rail_track', 2, 3)
    await expect(db.query(`select * from public.move_garden_placement($1, 9, 9)`, [under])).rejects.toThrow(/TRACK_IN_USE/)
    await expect(db.query(`delete from public.garden_placements where id = $1`, [under])).rejects.toThrow(/TRACK_IN_USE/)
    const free = await idOf('rail_track', 2, 5)
    await db.query(`delete from public.garden_placements where id = $1`, [free])
    // The train moves along the track only.
    const train = await idOf('freight_train', 2, 2)
    await expect(db.query(`select * from public.move_garden_placement($1, 7, 7)`, [train])).rejects.toThrow(/NOT_ON_TRACK/)
  })
})

describe('fruit and candy', () => {
  it('harvesting a ripe tree gives 2 fruit and no coins', async () => {
    const deck = (await one<{ id: string }>(`insert into public.decks (user_id, title, slug) values ($1, 'Fruit', $2) returning id`, [OWNER, `fruit-${Math.random().toString(36).slice(2, 9)}`])).id
    await db.query(`insert into public.deck_practice_days (user_id, deck_id, day) values ($1, $2, current_date - 1)`, [OWNER, deck])
    const before = await coins()
    const res = await one<{ fruit_earned: number; total_fruit: number }>(`select * from public.harvest_tree_fruit($1, $2, current_date)`, [OWNER, deck])
    expect(res).toEqual({ fruit_earned: 2, total_fruit: 2 })
    expect(await coins()).toBe(before)
    // Once a day per tree.
    await expect(db.query(`select * from public.harvest_tree_fruit($1, $2, current_date)`, [OWNER, deck])).rejects.toThrow(/FRUIT_NOT_READY/)
  })

  it('a powered Candy Factory turns 10 fruit into 1 candy box an hour; unpowered it waits', async () => {
    await buy('candy_factory', 6, 6)
    await setStock(25)
    await rewind(3)
    expect(Number((await settle()).candy)).toBe(0)
    await buy('windmill_small', 8, 6)
    await setStock(25)
    await rewind(3)
    const s = await settle()
    // 3 hours, but only 25 fruit: 2.5 boxes, every fruit used.
    expect(Number(s.candy)).toBeCloseTo(2.5, 3)
    expect(Number(s.fruit)).toBeCloseTo(0, 3)
  })
})

describe('the freight link: Candy Factory → track + train → Seaport', () => {
  // Candy Factory at (4..5, 10..11), Seaport at (2..7, 14..15), each powered by a Small Windmill.
  // Track: (4, 12) beside the factory's bottom edge, (4, 13) beside the port's top edge, then a run
  // along y = 12 to x = 8 and up to (8, 10): the Freight Train stands on (8, 10..12).
  async function build({ gap = false, train = true } = {}) {
    await buy('windmill_small', 2, 8) // field (1..4, 7..10): touches the factory at (4, 10)
    await buy('windmill_small', 0, 12) // field (-1..2, 11..14): touches the port at (2, 14)
    await buy('candy_factory', 4, 10)
    await buy('seaport', 2, 14)
    await trackCol(4, 12, 13)
    for (const x of [5, 6, 7, 8]) if (!(gap && x === 6)) await buy('rail_track', x, 12)
    await trackCol(8, 10, 11)
    if (train) await buy('freight_train', 8, 10)
  }

  it('finds the route and exports every whole box for 15 coins', async () => {
    await build()
    await setStock(0, 3.4)
    const before = await coins()
    const s = await settle()
    expect(s.candy_shipped).toBe(3)
    expect(s.candy_payout).toBe(45)
    expect(s.total_coins).toBe(before + 45)
    expect(Number(s.candy)).toBeCloseTo(0.4, 3)
  })

  it('a gap in the track or no train: nothing leaves', async () => {
    await build({ gap: true })
    await setStock(0, 3)
    expect((await settle()).candy_shipped).toBe(0)
  })

  it('no train on the stretch: nothing leaves', async () => {
    await build({ train: false })
    await setStock(0, 3)
    expect((await settle()).candy_shipped).toBe(0)
  })
})
