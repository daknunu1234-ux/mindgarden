import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, migratedDb } from '@/test/pglite'
import { catalogFor, type FarmItemType } from '../lib/farmCatalog'
import type { Placement } from '../lib/farmGrid'
import { poweredMap } from '../lib/powerGrid'
import { candyLinked } from '../lib/roads'

// Migration 20261018000000_road_logistics.sql on a real PostgreSQL (PGlite, every migration applied):
// road prices and tiles, the railway retired (saved tracks become roads, trains refunded), fruit and
// candy, and the road link's candy export (the same rule as lib/roads.ts candyLinked).

const OWNER = '11111111-1111-4111-8111-111111111111'
const MIGRATION = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261018000000_road_logistics.sql'), 'utf8')
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
const roadRow = async (y: number, x0: number, x1: number) => {
  for (let x = x0; x <= x1; x++) await buy('road', x, y)
}
const roadCol = async (x: number, y0: number, y1: number) => {
  for (let y = y0; y <= y1; y++) await buy('road', x, y)
}
// The island as the client sees it.
const layout = async (): Promise<Placement[]> =>
  (
    await db.query<{ id: string; item_type: FarmItemType; grid_x: number; grid_y: number; width: number; height: number }>(
      `select id, item_type, grid_x, grid_y, width, height from public.garden_placements where user_id = $1`,
      [OWNER],
    )
  ).rows.map((r) => ({ id: r.id, itemType: r.item_type, deckId: null, x: r.grid_x, y: r.grid_y, width: r.width, height: r.height, variant: null }))

beforeAll(async () => {
  db = await migratedDb()
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@test.dev')`, [OWNER])
}, 120_000)

beforeEach(async () => {
  await asUser(db, null)
  await db.query(`delete from public.garden_placements where user_id = $1`, [OWNER])
  await db.query(`delete from public.farm_economy where user_id = $1`, [OWNER])
  await db.query(`update public.users set coins = 1000 where id = $1`, [OWNER])
  await asUser(db, OWNER)
})

describe('roads: prices and placement', () => {
  it('a road costs 1 coin a tile; the rest as the catalogue says', async () => {
    await roadRow(5, 0, 9)
    expect(await coins()).toBe(1000 - 10)
    expect(catalogFor('road', null)).toMatchObject({ price: 1, width: 1, height: 1 })
    await buy('windmill_small', 0, 0)
    await buy('furniture_factory', 3, 0)
    await buy('candy_factory', 6, 0)
    await buy('seaport', 0, 14)
    expect(await coins()).toBe(990 - 60 - 50 - 50 - 100)
  })

  it('the railway is retired: no tracks, no trains for sale', async () => {
    await expect(buy('rail_track', 4, 4)).rejects.toThrow(/ITEM_RETIRED/)
    await expect(buy('freight_train', 4, 4)).rejects.toThrow(/ITEM_RETIRED/)
    expect(await coins()).toBe(1000)
  })

  it('one item per tile: nothing goes on a road; a road moves and is picked up freely', async () => {
    await roadCol(2, 2, 4)
    await expect(buy('rockery', 2, 3)).rejects.toThrow(/TILE_UNAVAILABLE/)
    await expect(buy('road', 2, 3)).rejects.toThrow(/TILE_UNAVAILABLE/)
    const middle = await idOf('road', 2, 3)
    await expect(db.query(`select * from public.move_garden_placement($1, 2, 4)`, [middle])).rejects.toThrow(/TILE_UNAVAILABLE/)
    await db.query(`select * from public.move_garden_placement($1, 9, 9)`, [middle])
    await db.query(`delete from public.garden_placements where id = $1`, [await idOf('road', 2, 4)])
    expect((await layout()).filter((p) => p.itemType === 'road').map((p) => [p.x, p.y]).sort()).toEqual([
      [2, 2],
      [9, 9],
    ])
  })
})

describe('the railway on saved islands (migration 20261018000000)', () => {
  it('tracks become roads on the same tiles; trains leave and refund their 30 coins', async () => {
    await asUser(db, null)
    // An island as it was before the migration: tracks, and a Freight Train standing on three of them.
    await db.query(`alter table public.garden_placements drop constraint garden_placements_item_type_check`)
    await db.query(`drop index public.unique_farm_tile`)
    for (const y of [3, 4, 5, 6]) {
      await db.query(`insert into public.garden_placements (user_id, item_type, grid_x, grid_y) values ($1, 'rail_track', 3, $2)`, [OWNER, y])
    }
    await db.query(`insert into public.garden_placements (user_id, item_type, grid_x, grid_y, width, height) values ($1, 'freight_train', 3, 3, 1, 3)`, [OWNER])
    await db.exec(MIGRATION)
    const rows = (await layout()).map((p) => [p.itemType, p.x, p.y, p.width, p.height])
    expect(rows.sort()).toEqual([
      ['road', 3, 3, 1, 1],
      ['road', 3, 4, 1, 1],
      ['road', 3, 5, 1, 1],
      ['road', 3, 6, 1, 1],
    ])
    expect(await coins()).toBe(1000 + 30)
    // The old item types are refused now, and one item per tile holds again.
    await expect(db.query(`insert into public.garden_placements (user_id, item_type, grid_x, grid_y) values ($1, 'rail_track', 9, 9)`, [OWNER])).rejects.toThrow(/item_type_check/)
    await expect(db.query(`insert into public.garden_placements (user_id, item_type, grid_x, grid_y) values ($1, 'rockery', 3, 4)`, [OWNER])).rejects.toThrow(/unique_farm_tile/)
    // The track trigger is gone: a road under where the train stood is picked up like any other.
    await db.query(`delete from public.garden_placements where user_id = $1 and grid_x = 3 and grid_y = 4`, [OWNER])
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
    expect(Number(s.candy)).toBeCloseTo(2.5, 3)
    expect(Number(s.fruit)).toBeCloseTo(0, 3)
  })
})

describe('the road link: Candy Factory → road → Seaport, by Delivery Truck', () => {
  // Candy Factory at (4..5, 10..11), Seaport at (2..7, 14..15). A Windmill at (8, 8) powers the factory
  // (field 4..13, 4..13); one at (0, 12) powers the port (field −4..5, 8..17). Road: straight down from
  // the factory's bottom edge, (4, 12) and (4, 13) beside the port's top edge; or a detour with bends:
  // east from beside the factory's right edge along y = 10 to x = 9, down x = 9 to y = 13, west along
  // y = 13 to (7, 13) beside the port. The gap is (9, 12).
  async function build({ gap = false, portPower = true, detour = false } = {}) {
    await buy('windmill_small', 8, 8)
    if (portPower) await buy('windmill_small', 0, 12)
    await buy('candy_factory', 4, 10)
    await buy('seaport', 2, 14)
    if (!detour) {
      await buy('road', 4, 12)
      if (!gap) await buy('road', 4, 13)
    } else {
      await roadRow(10, 6, 9)
      await buy('road', 9, 11)
      if (!gap) await buy('road', 9, 12)
      await roadRow(13, 7, 9)
    }
  }

  it('a straight road: every whole box is exported for 15 coins', async () => {
    await build()
    await setStock(0, 3.4)
    const before = await coins()
    const s = await settle()
    expect(s.candy_shipped).toBe(3)
    expect(s.candy_payout).toBe(45)
    expect(s.total_coins).toBe(before + 45)
    expect(Number(s.candy)).toBeCloseTo(0.4, 3)
    expect(candyLinked(await layout())).toBe(true)
  })

  it('a road with bends works the same', async () => {
    await build({ detour: true })
    await setStock(0, 2)
    expect((await settle()).candy_shipped).toBe(2)
  })

  it('a gap in the road, or a Seaport without power: nothing leaves (the client agrees)', async () => {
    await build({ detour: true, gap: true })
    await setStock(0, 3)
    expect((await settle()).candy_shipped).toBe(0)
    expect(candyLinked(await layout())).toBe(false)

    await asUser(db, null)
    await db.query(`delete from public.garden_placements where user_id = $1`, [OWNER])
    await asUser(db, OWNER)
    await build({ portPower: false })
    await setStock(0, 3)
    expect((await settle()).candy_shipped).toBe(0)
    const island = await layout()
    const powers = poweredMap(island)
    expect(candyLinked(island)).toBe(true) // linked by road …
    expect(candyLinked(island, (p) => powers.get(p.id) !== false)).toBe(false) // … but the dock has no power
  })
})
