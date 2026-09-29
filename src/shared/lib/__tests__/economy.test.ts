import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  canAffordSeed,
  COIN_PACKAGES,
  findCoinPackage,
  formatVnd,
  packageSavingsPercent,
  SEED_PRICE_COINS,
  seedsAffordable,
  STARTING_COINS,
} from '../economy'

describe('seed economy', () => {
  it('starts every gardener with 3 seeds worth of coins', () => {
    expect(STARTING_COINS).toBe(300)
    expect(SEED_PRICE_COINS).toBe(100)
    expect(seedsAffordable(STARTING_COINS)).toBe(3)
  })

  it('can afford a seed from exactly 100 coins', () => {
    expect(canAffordSeed(99)).toBe(false)
    expect(canAffordSeed(100)).toBe(true)
    expect(canAffordSeed(null)).toBe(false)
    expect(seedsAffordable(250)).toBe(2)
    expect(seedsAffordable(-5)).toBe(0)
  })
})

describe('Coin Shop packages', () => {
  it('lists the four packages with their VND prices', () => {
    expect(COIN_PACKAGES.map((p) => [p.coins, p.priceVnd])).toEqual([
      [10, 10_000],
      [20, 18_000],
      [50, 40_000],
      [100, 68_000],
    ])
    expect(findCoinPackage('coins-100')).toMatchObject({ bonus: '1 Tree Seed 🌱', bestValue: true })
    expect(findCoinPackage('coins-7')).toBeUndefined()
  })

  it('advertises the savings the prices really give', () => {
    expect(COIN_PACKAGES.map(packageSavingsPercent)).toEqual([0, 10, 20, 32])
  })

  it('formats VND with dot grouping', () => {
    expect(formatVnd(68_000)).toBe('68.000 ₫')
    expect(formatVnd(1_234_567)).toBe('1.234.567 ₫')
  })
})

// The database enforces the same numbers (it is the source of truth for balances). Keep them in sync.
describe('migration 20260928000500_seed_economy.sql', () => {
  const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'supabase', 'migrations', '20260928000500_seed_economy.sql'), 'utf8')

  it('gives new users 300 coins, by default and in the signup trigger', () => {
    expect(sql).toMatch(new RegExp(`alter column coins set default ${STARTING_COINS};`, 'i'))
    expect(sql).toMatch(/insert into public\.users \(id, email, full_name, avatar_url, coins\)/i)
    expect(sql).toMatch(new RegExp(`\\n\\s+${STARTING_COINS}\\s+-- starting purse`))
  })

  it('tops existing gardeners up to 300 once', () => {
    expect(sql).toMatch(new RegExp(`coins = greatest\\(coins, ${STARTING_COINS}\\)`, 'i'))
  })

  it('charges exactly the seed price, never below zero, and blocks free inserts', () => {
    expect(sql).toMatch(new RegExp(`coins = coins - ${SEED_PRICE_COINS}`))
    expect(sql).toMatch(new RegExp(`coins >= ${SEED_PRICE_COINS}`))
    expect(sql).toMatch(/revoke insert on table public\.decks from anon, authenticated;/i)
  })

  it('keeps the test top-up server-only', () => {
    expect(sql).toMatch(/revoke all on function public\.dev_grant_coins\(uuid, integer\) from public, anon, authenticated;/i)
  })
})
