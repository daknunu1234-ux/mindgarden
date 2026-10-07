import { describe, expect, it } from 'vitest'
import { TREE_SPECIES } from '@/shared/lib/treeSkins'
import { CROWN_TOP_SPECIES, crownTopY } from '../lib/crownTop'
import { ACTION_GAP, plotSprite, TREE_GROUND_Y } from '../lib/plotSprite'
import { measureCrownTop } from './crownTopMeasure'

// The 💧 / 🍎 icons rest on each tree's own crown tip, so lib/crownTop.ts must match the sprites.

describe('crownTopY', () => {
  it('covers every species in the catalog', () => {
    expect([...CROWN_TOP_SPECIES].sort()).toEqual(TREE_SPECIES.map((s) => s.id).sort())
  })

  it('matches the drawn sprites, species by species and stage by stage (re-measured)', () => {
    for (const species of TREE_SPECIES) {
      for (const stage of [1, 2, 3, 4, 5] as const) {
        const measured = measureCrownTop(species.id, stage)
        // The table rounds down (a hair higher): within one view unit, never below the real tip.
        expect(crownTopY(species.id, stage), `${species.id} stage ${stage}`).toBeLessThanOrEqual(measured)
        expect(measured - crownTopY(species.id, stage), `${species.id} stage ${stage}`).toBeLessThan(1)
      }
    }
  })

  it('rises as a tree grows, and retired ids use the species they render as', () => {
    for (const species of TREE_SPECIES) {
      const tops = [1, 2, 3, 4, 5].map((st) => crownTopY(species.id, st as 1))
      for (let i = 1; i < tops.length; i++) expect(tops[i], species.id).toBeLessThanOrEqual(tops[i - 1])
      expect(tops[0]).toBeLessThan(TREE_GROUND_Y)
    }
    expect(crownTopY('sakura', 3)).toBe(crownTopY('cherry', 3))
    expect(crownTopY('banyan', 2)).toBe(crownTopY('oak', 2))
  })

  it('puts the icons right on the tip: a sprout gets them low, a mature tree high', () => {
    const sprout = plotSprite(300, 300, 1, crownTopY('oak', 1))
    const mature = plotSprite(300, 300, 1, crownTopY('oak', 4))
    expect(sprout.actions.y).toBeGreaterThan(mature.actions.y + 80)
    for (const p of [sprout, mature]) expect(p.actions.y - p.treeTop).toBe(-ACTION_GAP)
  })
})
