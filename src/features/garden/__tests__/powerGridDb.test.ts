import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { asUser, migratedDb } from '@/test/pglite'

// Migration 20261014000000_power_grid.sql on a real PostgreSQL (PGlite, every migration applied):
// the new buildings, retired ones, the coast rule, power, and the export loop.

const OWNER = '11111111-1111-4111-8111-111111111111'
let db: PGlite
const one = async <T,>(sql: string, params: unknown[] = []): Promise<T> => (await db.query<T>(sql, params)).rows[0]
const buy = (type: string, x: number, y: number) => db.query(`select * from public.purchase_and_place_item($1, $2, $3)`, [type, x, y])
const coins = async () => Number((await one<{ coins: number }>(`select coins from public.users where id = $1`, [OWNER])).coins)
// Wind the clock back on the gardener's stock, as if `hours` had passed since the last visit.
const rewind = (hours: number, exportHours = hours) =>
  db.query(
    `update public.farm_economy set last_tick_at = now() - make_interval(secs => $2::double precision * 3600), last_export_at = now() - make_interval(secs => $3::double precision * 3600) where user_id = $1`,
    [OWNER, hours, exportHours],
  )
// A deck of the gardener's (decks are created by plant_deck in the app; directly here).
const newDeck = async (title: string) =>
  (await one<{ id: string }>(`insert into public.decks (user_id, title, slug) values ($1, $2, $3) returning id`, [OWNER, title, `tree-${Math.random().toString(36).slice(2, 10)}`])).id
const settle = () => one<{ timber: string; produce: string; furniture: string; payout: number; total_coins: number }>(`select * from public.settle_farm_economy()`)

beforeAll(async () => {
  db = await migratedDb()
  await db.query(`insert into auth.users (id, email) values ($1, 'owner@test.dev')`, [OWNER])
}, 120_000)

beforeEach(async () => {
  await asUser(db, null)
  await db.query(`delete from public.garden_placements where user_id = $1`, [OWNER])
  await db.query(`delete from public.farm_economy where user_id = $1`, [OWNER])
  await db.query(`update public.users set coins = 2000 where id = $1`, [OWNER])
  await asUser(db, OWNER)
})

describe('buying the new buildings', () => {
  it('charges the catalogue prices and sizes, the 6 × 2 seaport included', async () => {
    await buy('windmill_small', 2, 4)
    await buy('furniture_factory', 4, 4)
    await buy('seaport', 0, 14)
    // Today's prices (migration 20261015000000; the Windmill 60 since 20261017000000).
    expect(await coins()).toBe(2000 - 60 - 50 - 100)
    const rows = (await db.query<{ item_type: string; width: number; height: number }>(`select item_type, width, height from public.garden_placements where user_id = $1 order by item_type`, [OWNER])).rows
    expect(rows).toEqual([
      { item_type: 'furniture_factory', width: 2, height: 2 },
      { item_type: 'seaport', width: 6, height: 2 },
      { item_type: 'windmill_small', width: 2, height: 2 },
    ])
  })

  it('no longer sells the retired buildings', async () => {
    await expect(buy('farmer_house', 0, 0)).rejects.toThrow(/ITEM_RETIRED/)
    await expect(buy('woodshop', 0, 0)).rejects.toThrow(/ITEM_RETIRED/)
    await expect(buy('windmill_large', 0, 0)).rejects.toThrow(/ITEM_RETIRED/)
    expect(await coins()).toBe(2000)
  })

  it('folds any Grand Windmill left standing into a Windmill on the same tiles (migration 20261017000000)', async () => {
    const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20261017000000_unified_windmill.sql'), 'utf8')
    await asUser(db, null)
    // A Grand Windmill as an island had it before the migration (the type check allowed it then).
    await db.query(`alter table public.garden_placements drop constraint garden_placements_item_type_check`)
    await db.query(`insert into public.garden_placements (user_id, item_type, grid_x, grid_y, width, height) values ($1, 'windmill_large', 3, 5, 2, 2)`, [OWNER])
    await db.exec(sql)
    expect((await db.query(`select item_type, grid_x, grid_y, width, height from public.garden_placements where user_id = $1`, [OWNER])).rows).toEqual([
      { item_type: 'windmill_small', grid_x: 3, grid_y: 5, width: 2, height: 2 },
    ])
    await expect(db.query(`insert into public.garden_placements (user_id, item_type, grid_x, grid_y) values ($1, 'windmill_large', 9, 9)`, [OWNER])).rejects.toThrow(/item_type_check/)
    expect(await coins()).toBe(2000)
  })

  it('puts the seaport on the shore only (first or last two rows), and keeps it there on a move', async () => {
    await expect(buy('seaport', 5, 5)).rejects.toThrow(/NOT_COASTAL/)
    await expect(buy('seaport', 5, 13)).rejects.toThrow(/NOT_COASTAL/)
    await expect(buy('seaport', 11, 0)).rejects.toThrow(/TILE_UNAVAILABLE/)
    await buy('seaport', 10, 0)
    const { id } = await one<{ id: string }>(`select id from public.garden_placements where item_type = 'seaport'`)
    await expect(db.query(`select * from public.move_garden_placement($1, 3, 6)`, [id])).rejects.toThrow(/NOT_COASTAL/)
    await db.query(`select * from public.move_garden_placement($1, 2, 14)`, [id])
    expect(await one(`select grid_x, grid_y from public.garden_placements where id = $1`, [id])).toEqual({ grid_x: 2, grid_y: 14 })
  })
})

describe('power', () => {
  const powered = async (type: string) =>
    (await one<{ on: boolean }>(`select public.farm_building_powered(id) as on from public.garden_placements where item_type = $1`, [type])).on

  it('a factory touching a windmill field works; out of reach it does not', async () => {
    await buy('furniture_factory', 12, 12)
    expect(await powered('furniture_factory')).toBe(false)
    // Windmill at (0..1, 6..7): its field is (−4..5, 2..11), far from the factory at (12..13, 12..13).
    await buy('windmill_small', 0, 6)
    expect(await powered('furniture_factory')).toBe(false)
    // Windmill at (8..9, 4..5): field (4..13, 0..9): the right columns, but 9 < 12. Still off.
    await buy('windmill_small', 8, 4)
    expect(await powered('furniture_factory')).toBe(false)
    // Windmill at (8..9, 8..9): field (4..13, 4..13) shares tiles with the factory.
    await buy('windmill_small', 8, 8)
    expect(await powered('furniture_factory')).toBe(true)
  })

  it('the Windmill (2 × 2) reaches 4 tiles all round: a 10 × 10 zone', async () => {
    expect((await one<{ r: number }>(`select public.farm_power_reach('windmill_small') as r`)).r).toBe(4)
    await buy('windmill_small', 0, 0)
    await buy('furniture_factory', 5, 5)
    expect(await powered('furniture_factory')).toBe(true)
    await db.query(`delete from public.garden_placements where item_type = 'furniture_factory'`)
    await buy('furniture_factory', 6, 6)
    expect(await powered('furniture_factory')).toBe(false)
  })
})

describe('settle_farm_economy: production and the cargo ship', () => {
  it('trees make timber, animals produce; capped; the stock is the player’s to read, not write', async () => {
    await db.query(`select * from public.purchase_and_place_item('animal', 0, 0, null, 'cow')`)
    for (let i = 0; i < 3; i++) {
      await db.query(`select * from public.purchase_and_place_item('tree', $1, 3, $2)`, [i, await newDeck(`Tree ${i}`)])
    }
    await settle()
    await rewind(5)
    const after = await settle()
    expect(Number(after.timber)).toBeCloseTo(15, 0)
    expect(Number(after.produce)).toBeCloseTo(5, 0)
    expect(Number(after.furniture)).toBe(0)
    await rewind(100)
    const capped = await settle()
    expect(Number(capped.timber)).toBe(60)
    expect(Number(capped.produce)).toBe(40)
    // Players read their stock; only settle_farm_economy() writes it.
    expect(await one(`select has_table_privilege('authenticated', 'public.farm_economy', 'SELECT') as r, has_table_privilege('authenticated', 'public.farm_economy', 'UPDATE') as u, has_table_privilege('authenticated', 'public.farm_economy', 'INSERT') as i`)).toEqual({ r: true, u: false, i: false })
  })

  it('a powered factory turns timber into furniture; unpowered it waits', async () => {
    await db.query(`select * from public.purchase_and_place_item('tree', 0, 8, $1)`, [await newDeck('Wood')])
    await buy('furniture_factory', 4, 8)
    await settle()
    await rewind(10)
    expect(Number((await settle()).furniture)).toBe(0)
    await buy('windmill_small', 6, 8)
    await rewind(10)
    // 10 more timber (20 in all), the factory made 10 furniture from 20... capped by the hours: 10.
    const s = await settle()
    expect(Number(s.furniture)).toBeCloseTo(10, 0)
    expect(Number(s.timber)).toBeCloseTo(0, 0)
  })

  it('a powered seaport’s ship pays every 4 hours, at most 15 coins, leaving the rest in stock', async () => {
    await db.query(`insert into public.farm_economy (user_id, furniture, produce, timber) values ($1, 10, 4, 10)`, [OWNER])
    await buy('seaport', 0, 14)
    await buy('windmill_small', 6, 14)
    const before = await coins()
    // Not 4 hours yet: no ship.
    await rewind(1, 1)
    expect((await settle()).payout).toBe(0)
    // 4 hours: worth floor(30 + 2 + 2) = 34, the ship pays 15 and takes 15/34 of every good.
    await rewind(0, 4)
    const visit = await settle()
    expect(visit.payout).toBe(15)
    expect(visit.total_coins).toBe(before + 15)
    expect(Number(visit.furniture)).toBeCloseTo(10 * (1 - 15 / 34), 2)
    // Right after, no second ship.
    expect((await settle()).payout).toBe(0)
  })

  it('an unpowered seaport ships nothing', async () => {
    await db.query(`insert into public.farm_economy (user_id, furniture) values ($1, 10)`, [OWNER])
    await buy('seaport', 0, 0)
    await rewind(0, 10)
    expect((await settle()).payout).toBe(0)
  })
})
