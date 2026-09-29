import { describe, expect, it } from 'vitest'
import { getTreeSizeTier, MAX_TREE_SCALE, TREE_SIZE_TIERS } from '../treeSkins'

const tierOf = (n: number) => getTreeSizeTier(n).tier

describe('getTreeSizeTier', () => {
  it('puts every boundary in the right tier', () => {
    expect(tierOf(0)).toBe('sm')
    expect(tierOf(50)).toBe('sm')
    expect(tierOf(51)).toBe('md')
    expect(tierOf(120)).toBe('md')
    expect(tierOf(121)).toBe('lg')
    expect(tierOf(200)).toBe('lg')
    expect(tierOf(201)).toBe('xl')
    expect(tierOf(5000)).toBe('xl')
  })

  it('maps tiers to the documented multipliers and badges', () => {
    expect(getTreeSizeTier(10)).toMatchObject({ scale: 0.85, badge: '🌱 Compact' })
    expect(getTreeSizeTier(80)).toMatchObject({ scale: 1, badge: '🌿 Standard' })
    expect(getTreeSizeTier(150)).toMatchObject({ scale: 1.18, badge: '🌳 Sturdy' })
    expect(getTreeSizeTier(300)).toMatchObject({ scale: 1.35, badge: '👑 Colossal' })
    expect(MAX_TREE_SCALE).toBe(1.35)
  })

  it('handles odd input without throwing', () => {
    expect(tierOf(-5)).toBe('sm')
    expect(tierOf(Number.NaN)).toBe('sm')
    expect(tierOf(50.9)).toBe('sm')
    expect(tierOf(Number.POSITIVE_INFINITY)).toBe('xl')
  })

  it('has contiguous, non-overlapping ranges that grow with the tier', () => {
    for (let i = 1; i < TREE_SIZE_TIERS.length; i++) {
      const prev = TREE_SIZE_TIERS[i - 1]
      const cur = TREE_SIZE_TIERS[i]
      expect(cur.min).toBe((prev.max ?? Number.NaN) + 1)
      expect(cur.scale).toBeGreaterThan(prev.scale)
    }
    expect(TREE_SIZE_TIERS[0].min).toBe(0)
    expect(TREE_SIZE_TIERS.at(-1)?.max).toBeNull()
  })
})
