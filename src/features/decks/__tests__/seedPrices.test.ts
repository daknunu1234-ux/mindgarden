import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/shared/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { SeedPricePill } from '@/shared/components/game'
import { canAffordSeed, SEED_PRICE_COINS, seedPriceTag, SURREAL_SEED_PRICE_COINS } from '@/shared/lib/economy'
import { createClient } from '@/shared/lib/supabase/server'
import { isSurrealForm, seedPrice, speciesUpgradeCost, TREE_SPECIES } from '@/shared/lib/treeSkins'
import { updateDeck } from '../actions/updateDeck'
import { TreeSpeciesPicker } from '../components/TreeSpeciesPicker'

const SURREAL = ['crystal_flora', 'cosmic_nebula', 'chrono_willow']
const OWNER = '11111111-1111-4111-8111-111111111111'
const DECK = '22222222-2222-4222-8222-222222222222'

describe('seed prices in the species registry', () => {
  it('prices the three surreal species at exactly 180 coins and every other species at 100', () => {
    expect(SURREAL_SEED_PRICE_COINS).toBe(180)
    expect(SEED_PRICE_COINS).toBe(100)
    for (const id of SURREAL) expect(seedPrice(id), id).toBe(180)
    for (const species of TREE_SPECIES) {
      expect(species.price, species.id).toBe(isSurrealForm(species.form) ? 180 : 100)
      expect(seedPrice(species.id)).toBe(species.price)
    }
    expect(TREE_SPECIES.filter((s) => s.price === 180).map((s) => s.id)).toEqual(SURREAL)
  })

  it('prices retired and unknown ids as the species they render as', () => {
    expect(seedPrice('sakura')).toBe(100)
    expect(seedPrice('banyan')).toBe(100)
    expect(seedPrice(null)).toBe(100)
  })

  it('charges only the difference to change a planted tree to a pricier species', () => {
    expect(speciesUpgradeCost('oak', 'chrono_willow')).toBe(80)
    expect(speciesUpgradeCost('sakura', 'crystal_flora')).toBe(80)
    expect(speciesUpgradeCost('cosmic_nebula', 'chrono_willow')).toBe(0)
    expect(speciesUpgradeCost('chrono_willow', 'oak')).toBe(0) // no refund
    expect(speciesUpgradeCost('oak', 'pine')).toBe(0)
  })

  it('affords a seed only from its own price', () => {
    expect(canAffordSeed(179, 180)).toBe(false)
    expect(canAffordSeed(180, 180)).toBe(true)
    expect(canAffordSeed(100, 180)).toBe(false)
    expect(canAffordSeed(100)).toBe(true)
    expect(canAffordSeed(null, 180)).toBe(false)
  })
})

describe('price tags', () => {
  it('reads "🪙 N", and turns to the alert tone with a tooltip when the purse is short', () => {
    expect(seedPriceTag(180, 300)).toEqual({ price: 180, label: '🪙 180', short: false, title: 'Seed price: 180 coins' })
    expect(seedPriceTag(180, 120)).toEqual({ price: 180, label: '🪙 180', short: true, title: 'Not enough coins: you need 60 more 🪙' })
    expect(seedPriceTag(100, 100).short).toBe(false)
    // An unknown purse is never "short": the server decides.
    expect(seedPriceTag(180, null).short).toBe(false)
    expect(seedPriceTag(180, undefined).short).toBe(false)
  })

  it('SeedPricePill shows the coin and the number, dimmed red when short', () => {
    const ok = renderToStaticMarkup(createElement(SeedPricePill, { price: 180, coins: 300 }))
    expect(ok).toContain('🪙')
    expect(ok).toContain('data-price="180"')
    expect(ok).toMatch(/>180<\/span>$/)
    expect(ok).not.toContain('data-short')
    const short = renderToStaticMarkup(createElement(SeedPricePill, { price: 180, coins: 20 }))
    expect(short).toContain('data-short="true"')
    expect(short).toContain('title="Not enough coins: you need 160 more 🪙"')
    expect(short).toContain('text-red-700')
  })

  it('the planting form picker tags every species card with its price', () => {
    const html = renderToStaticMarkup(createElement(TreeSpeciesPicker, { value: 'oak', onChange: () => undefined, coins: 300 }))
    const prices = [...html.matchAll(/data-price="(\d+)"/g)].map((m) => Number(m[1]))
    expect(prices).toEqual(TREE_SPECIES.map((s) => s.price))
    expect(prices.filter((p) => p === 180)).toHaveLength(3)
    expect(prices.filter((p) => p === 100)).toHaveLength(10)
    expect(html).not.toContain('data-short')
  })

  it('dims exactly the tags the purse cannot pay', () => {
    const count = (coins: number | null) => (renderToStaticMarkup(createElement(TreeSpeciesPicker, { value: 'oak', onChange: () => undefined, coins })).match(/data-short="true"/g) ?? []).length
    expect(count(300)).toBe(0)
    expect(count(120)).toBe(3) // the three surreal seeds
    expect(count(99)).toBe(13)
    expect(count(null)).toBe(0)
  })

  it('the Workshop picker tags only the species that cost extra, with the difference', () => {
    const upgrades = (value: string) => [...renderToStaticMarkup(createElement(TreeSpeciesPicker, { compact: true, value, onChange: () => undefined })).matchAll(/data-upgrade="(\d+)"/g)].map((m) => Number(m[1]))
    expect(upgrades('oak')).toEqual([80, 80, 80])
    expect(upgrades('chrono_willow')).toEqual([])
    expect(renderToStaticMarkup(createElement(TreeSpeciesPicker, { compact: true, value: 'oak', onChange: () => undefined }))).toContain('Chrono Willow · change for 80 🪙')
  })
})

// The player's client with the species-upgrade trigger of migration 20261006000000 emulated: a
// pricier species charges the owner the difference in the same UPDATE, or refuses it.
function fakeSupabase({ treeType, coins }: { treeType: string; coins: number }) {
  const sqlPrice = (t: string) => (SURREAL.includes(t) ? 180 : 100)
  const db = { coins, deck: { id: DECK, user_id: OWNER, title: 'T', slug: 't', description: null, is_public: false, tree_type: treeType, created_at: '2026-10-01T00:00:00Z', is_tournament_open: false } }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER } } }) },
    from: (table: string) => {
      let patch: { tree_type?: string } | null = null
      const q = {
        select: () => q,
        eq: () => q,
        update: (values: { tree_type?: string }) => {
          patch = values
          return q
        },
        maybeSingle: async () => ({ data: table === 'users' ? { coins: db.coins } : db.deck, error: null }),
        single: async () => {
          if (patch?.tree_type && patch.tree_type !== db.deck.tree_type) {
            const diff = sqlPrice(patch.tree_type) - sqlPrice(db.deck.tree_type)
            if (diff > 0) {
              if (db.coins < diff) return { data: null, error: { code: 'P0001', message: 'INSUFFICIENT_COINS' } }
              db.coins -= diff
            }
          }
          db.deck = { ...db.deck, ...patch }
          return { data: db.deck, error: null }
        },
      }
      return q
    },
  }
  vi.mocked(createClient).mockResolvedValue(client as never)
  return db
}

describe('changing a planted tree to a surreal species (Tree Workshop)', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deducts the 80-coin difference and reports the purse after it', async () => {
    const db = fakeSupabase({ treeType: 'oak', coins: 300 })
    expect(await updateDeck({ deckId: DECK, treeType: 'chrono_willow' })).toMatchObject({ success: true, data: { treeType: 'chrono_willow', remainingCoins: 220 } })
    expect(db.coins).toBe(220)
  })

  it('refuses when the purse is short, changing nothing', async () => {
    const db = fakeSupabase({ treeType: 'oak', coins: 79 })
    expect(await updateDeck({ deckId: DECK, treeType: 'cosmic_nebula' })).toEqual({
      success: false,
      error: { code: 'INSUFFICIENT_COINS', message: 'You need 80 coins to change this tree to that species!' },
    })
    expect(db.coins).toBe(79)
    expect(db.deck.tree_type).toBe('oak')
  })

  it('charges nothing between same-priced species or back to a cheaper one (no refund)', async () => {
    const db = fakeSupabase({ treeType: 'crystal_flora', coins: 50 })
    expect(await updateDeck({ deckId: DECK, treeType: 'cosmic_nebula' })).toMatchObject({ success: true, data: { remainingCoins: null } })
    expect(await updateDeck({ deckId: DECK, treeType: 'oak' })).toMatchObject({ success: true, data: { treeType: 'oak', remainingCoins: null } })
    expect(db.coins).toBe(50)
    const other = fakeSupabase({ treeType: 'oak', coins: 50 })
    expect(await updateDeck({ deckId: DECK, treeType: 'pine' })).toMatchObject({ success: true, data: { remainingCoins: null } })
    expect(other.coins).toBe(50)
  })
})

describe('migration 20261006000000_species_seed_prices.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261006000000_species_seed_prices.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('prices the same species at the same amounts as the registry', () => {
    const surreal = /when p_tree_type in \(([^)]*)\) then (\d+)/.exec(body)
    expect(surreal).not.toBeNull()
    expect(surreal![1].split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual(SURREAL)
    expect(Number(surreal![2])).toBe(SURREAL_SEED_PRICE_COINS)
    expect(Number(/else (\d+)/.exec(body)![1])).toBe(SEED_PRICE_COINS)
  })

  it('plants for the species price, atomically and never below zero', () => {
    expect(body).toMatch(/v_price integer := public\.seed_price\(coalesce\(p_tree_type, 'oak'\)\)/)
    expect(body).toMatch(/set coins = coins - v_price\s+where id = v_user and coins >= v_price/)
    expect(body).not.toMatch(/coins = coins - 100/)
  })

  it('clones for the species price plus at most 50 statements', () => {
    expect(body).toMatch(/v_cost := public\.seed_price\(v_source\.tree_type\) \+ least\(v_items, 50\)/)
    expect(body).toMatch(/coins >= v_cost/)
  })

  it('charges the difference when a player changes a tree to a pricier species, or refuses', () => {
    expect(body).toMatch(/v_diff := public\.seed_price\(new\.tree_type\) - public\.seed_price\(old\.tree_type\)/)
    expect(body).toMatch(/if v_diff > 0 and auth\.uid\(\) is not null then/)
    expect(body).toMatch(/where id = new\.user_id and coins >= v_diff/)
    expect(body).toMatch(/INSUFFICIENT_COINS/)
    expect(body).toMatch(/before update of tree_type on public\.decks/)
    expect(body).toMatch(/revoke all on function public\.charge_species_upgrade\(\) from public, anon, authenticated/)
  })
})
