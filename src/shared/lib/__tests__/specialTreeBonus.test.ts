import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { CoinBonusTag } from '@/shared/components/game'
import { coinBonusLabel, coinBonusPercent, MASTERY_COIN, masteryCoinPayout, SPECIAL_COIN_MULTIPLIER, SURREAL_SEED_PRICE_COINS } from '../economy'
import { isSpecialTree, seedPrice, speciesCoinMultiplier, TREE_SPECIES, TREE_TYPE_IDS } from '../treeSkins'

const SPECIAL = ['crystal_flora', 'cosmic_nebula', 'chrono_willow']
const STANDARD = ['oak', 'pine', 'birch', 'cherry', 'willow', 'mystic', 'palm', 'citrus', 'maple', 'cactus']

describe('special trees (the 180 🪙 species)', () => {
  it('are exactly the species whose seed costs 180', () => {
    expect(SURREAL_SEED_PRICE_COINS).toBe(180)
    for (const id of SPECIAL) expect(isSpecialTree(id), id).toBe(true)
    for (const id of STANDARD) expect(isSpecialTree(id), id).toBe(false)
    expect(TREE_TYPE_IDS.filter((id) => isSpecialTree(id))).toEqual(SPECIAL)
    // The rule is the price, not a list: every 180 species is special and nothing else is.
    for (const species of TREE_SPECIES) expect(isSpecialTree(species.id), species.id).toBe(species.price === 180)
    for (const id of TREE_TYPE_IDS) expect(isSpecialTree(id)).toBe(seedPrice(id) === 180)
  })

  it('treats retired, unknown and missing species as the standard tree they render as', () => {
    for (const id of ['sakura', 'bamboo', 'apple', 'saguaro', 'banyan', '', null, undefined]) {
      expect(isSpecialTree(id), String(id)).toBe(false)
      expect(speciesCoinMultiplier(id), String(id)).toBe(1)
    }
  })

  it('pay ×1.5 mastery coins; standard trees ×1', () => {
    expect(SPECIAL_COIN_MULTIPLIER).toBe(1.5)
    for (const id of SPECIAL) expect(speciesCoinMultiplier(id), id).toBe(1.5)
    for (const id of STANDARD) expect(speciesCoinMultiplier(id), id).toBe(1)
  })
})

describe('masteryCoinPayout: what one mastered statement pays', () => {
  // Master `count` statements in a row and collect what each one paid.
  const run = (count: number, farmBuff: number, bonus: number) => {
    let carry = 0
    const paid: number[] = []
    for (let i = 0; i < count; i++) {
      const next = masteryCoinPayout(farmBuff, bonus, carry)
      paid.push(next.coins)
      carry = next.carry
    }
    return { paid, total: paid.reduce((a, b) => a + b, 0), carry }
  }

  it('pays a standard tree 1 coin a statement, as before', () => {
    expect(MASTERY_COIN).toBe(1)
    expect(masteryCoinPayout(1, 1, 0)).toEqual({ coins: 1, carry: 0 })
    expect(run(10, 1, speciesCoinMultiplier('oak'))).toMatchObject({ paid: Array(10).fill(1), total: 10, carry: 0 })
  })

  it('pays a special tree exactly one and a half times as much: 1, 2, 1, 2, …', () => {
    const bonus = speciesCoinMultiplier('cosmic_nebula')
    expect(masteryCoinPayout(1, bonus, 0)).toEqual({ coins: 1, carry: 0.5 })
    expect(masteryCoinPayout(1, bonus, 0.5)).toEqual({ coins: 2, carry: 0 })
    expect(run(6, 1, bonus).paid).toEqual([1, 2, 1, 2, 1, 2])
    for (const count of [2, 10, 40, 100]) expect(run(count, 1, bonus).total, `${count} statements`).toBe(count * 1.5)
    // An odd number of statements keeps the half coin for the next one: nothing is lost.
    expect(run(5, 1, bonus)).toMatchObject({ total: 7, carry: 0.5 })
    // Never more than 1.5× (rounding each payout up would pay double).
    for (const count of [1, 3, 7, 21]) expect(run(count, 1, bonus).total).toBeLessThanOrEqual(count * 1.5)
  })

  it('stacks with the farm buffs: stream ×1.2, Farmer\'s House ×1.5, both ×1.8', () => {
    const bonus = SPECIAL_COIN_MULTIPLIER
    expect(run(10, 1.2, bonus).total).toBe(18) // ×1.8
    expect(run(4, 1.5, bonus).total).toBe(9) // ×2.25
    expect(run(10, 1.8, bonus).total).toBe(27) // ×2.7
    expect(masteryCoinPayout(1.8, bonus, 0)).toEqual({ coins: 2, carry: 0.7 })
    // A standard tree with the same buffs, for comparison.
    expect(run(10, 1.8, 1).total).toBe(18)
    expect(run(10, 1.8, bonus).total / run(10, 1.8, 1).total).toBe(1.5)
  })

  it('keeps the carry under one coin and shrugs off nonsense', () => {
    for (const [farm, bonus] of [[1, 1.5], [1.2, 1.5], [1.8, 1.5], [1.2, 1]]) {
      let carry = 0
      for (let i = 0; i < 50; i++) {
        const next = masteryCoinPayout(farm, bonus, carry)
        expect(next.carry).toBeGreaterThanOrEqual(0)
        expect(next.carry).toBeLessThan(1)
        expect(Number.isInteger(next.coins)).toBe(true)
        carry = next.carry
      }
    }
    expect(masteryCoinPayout(Number.NaN, 1.5, 0)).toEqual({ coins: 1, carry: 0.5 })
    expect(masteryCoinPayout(1, 0, 0)).toEqual({ coins: 1, carry: 0 })
    expect(masteryCoinPayout(1, 1, -4)).toEqual({ coins: 1, carry: 0 })
  })
})

describe('bonus tag', () => {
  it('reads "1.5x Coins" / "+50%"', () => {
    expect(coinBonusLabel(1.5)).toBe('1.5x Coins')
    expect(coinBonusPercent(1.5)).toBe('+50%')
    expect(coinBonusLabel(2)).toBe('2x Coins')
  })

  it('shows on special trees only', () => {
    const tag = (id: string, compact = false) => renderToStaticMarkup(createElement(CoinBonusTag, { multiplier: speciesCoinMultiplier(id), compact }))
    for (const id of SPECIAL) {
      expect(tag(id), id).toContain('data-coin-bonus="1.5"')
      expect(tag(id), id).toContain('1.5x Coins')
      expect(tag(id), id).toContain('⭐')
    }
    for (const id of STANDARD) expect(tag(id), id).toBe('')
    // The tight spot (the practice round's coin plaque): "⭐ 1.5x".
    expect(tag('crystal_flora', true).replace(/<[^>]+>/g, '')).toBe('⭐1.5x')
  })

  it('is on every special seed card, the tree popover and the round\'s coin plaque', () => {
    const src = join(__dirname, '..', '..', '..')
    const read = (file: string) => readFileSync(join(src, file), 'utf8')
    for (const file of ['features/garden/components/FarmShopModal.tsx', 'features/decks/components/TreeSpeciesPicker.tsx']) {
      expect(read(file), file).toContain('<CoinBonusTag multiplier={speciesCoinMultiplier(species.id)} />')
    }
    const popover = read('features/garden/components/FarmPlotDialog.tsx')
    expect(popover).toContain('const bonus = speciesCoinMultiplier(plot.treeType)')
    expect(popover).toContain('<CoinBonusTag multiplier={bonus} />')
    // The popover's payout line multiplies the farm buff by the bonus.
    expect(popover).toContain('const payout = +((plot.buff ?? 1) * bonus).toFixed(2)')
    expect(read('features/drill/components/DrillOverlay.tsx')).toContain('<GoldReward coins={stats.coinsEarned} bonus={speciesCoinMultiplier(session.deck.treeType)} />')
  })
})

describe('migration 20261009000000_special_tree_coin_bonus.sql', () => {
  const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261009000000_special_tree_coin_bonus.sql'), 'utf8')
  const body = sql.split('-- Verify')[0]

  it('pays the same bonus as the app, to the same species: the ones priced at 180', () => {
    const rule = /when public\.seed_price\(coalesce\(p_tree_type, 'oak'\)\) = (\d+) then ([\d.]+)/.exec(body)
    expect(rule).not.toBeNull()
    expect(Number(rule![1])).toBe(SURREAL_SEED_PRICE_COINS)
    expect(Number(rule![2])).toBe(SPECIAL_COIN_MULTIPLIER)
    expect(body).toMatch(/else 1\s+end::numeric/)
  })

  it('multiplies the farm buff by the species bonus and carries the fraction', () => {
    expect(body).toContain('select 1 * public.farm_coin_multiplier(p_user_id, v_deck) * public.species_coin_multiplier(v_species) + u.coin_carry into v_amount')
    expect(body).toContain('v_pay := floor(coalesce(v_amount, 1))::integer;')
    expect(body).toContain('coin_carry = coalesce(v_amount, 1) - v_pay')
    // The species comes from the statement's own tree, read in the database.
    expect(body).toMatch(/select n\.deck_id, d\.tree_type into v_deck, v_species[\s\S]*join public\.decks d on d\.id = n\.deck_id/)
  })

  it('still pays each statement once, at 5/5, and only through the service role', () => {
    expect(body).toMatch(/and mastery_level = 5\s+and coin_awarded_at is null/)
    expect(body).toContain('revoke all on function public.award_mastery_coin(uuid, uuid) from public, anon, authenticated;')
    expect(body).toContain('grant execute on function public.award_mastery_coin(uuid, uuid) to service_role;')
    expect(body).toContain('revoke all on function public.species_coin_multiplier(text) from public, anon, authenticated;')
    expect(body.trim().startsWith('--')).toBe(true)
    expect(body).toMatch(/\nbegin;\n[\s\S]*\ncommit;/)
  })
})
