import { describe, expect, it } from 'vitest'
import { coinsFromLevels, gardenerLevel, levelTitle, xpForLevel, xpFromLevels } from '../lib/gardenerLevel'

describe('coinsFromLevels', () => {
  it('pays 5 coins per mastery step, from the same data as XP', () => {
    expect(coinsFromLevels([])).toBe(0)
    expect(coinsFromLevels([3, 1, 0])).toBe(20)
    expect(coinsFromLevels([7, -2])).toBe(15)
  })
})

describe('xpFromLevels', () => {
  it('gives 10 XP per mastery step and clamps bad values', () => {
    expect(xpFromLevels([])).toBe(0)
    expect(xpFromLevels([3, 1, 0])).toBe(40)
    expect(xpFromLevels([7, -2])).toBe(30)
  })
})

describe('gardenerLevel', () => {
  it('starts at level 1 with an empty bar', () => {
    expect(gardenerLevel(0)).toMatchObject({ level: 1, xpIntoLevel: 0, xpForNextLevel: 50, progress: 0 })
  })

  it('levels up exactly at the threshold (50, then 75, then 100 …)', () => {
    expect(gardenerLevel(49).level).toBe(1)
    expect(gardenerLevel(50)).toMatchObject({ level: 2, xpIntoLevel: 0, xpForNextLevel: 75 })
    expect(gardenerLevel(124).level).toBe(2)
    expect(gardenerLevel(125)).toMatchObject({ level: 3, xpIntoLevel: 0, xpForNextLevel: 100 })
  })

  it('reports progress inside the level', () => {
    expect(gardenerLevel(75)).toMatchObject({ level: 2, xpIntoLevel: 25, progress: 25 / 75 })
  })

  it('never goes below level 1', () => {
    expect(gardenerLevel(-100)).toMatchObject({ level: 1, xp: 0 })
  })

  it('grows with the cost curve 50 + 25 × (L − 1)', () => {
    expect([1, 2, 3, 10].map(xpForLevel)).toEqual([50, 75, 100, 275])
  })
})

describe('levelTitle', () => {
  it('names level bands', () => {
    expect(levelTitle(1)).toBe('Seedling Gardener')
    expect(levelTitle(3)).toBe('Sprout Keeper')
    expect(levelTitle(9)).toBe('Grove Tender')
    expect(levelTitle(10)).toBe('Orchard Keeper')
    expect(levelTitle(40)).toBe('Ancient Forester')
  })
})
