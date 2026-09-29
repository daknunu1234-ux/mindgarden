import { describe, expect, it } from 'vitest'
import { showcaseSlots } from '../lib/showcase'
import type { PlantedTreeView } from '../types'

const tree = (slug: string, mightyRoots: number, masteryPercent = 50): PlantedTreeView => ({
  slug,
  title: slug,
  treeType: 'oak',
  isPublic: true,
  itemCount: 10,
  masteryPercent,
  mightyRoots,
})

describe('showcaseSlots', () => {
  it('shows only trees with Mighty Roots, most first, then fills locked frames', () => {
    const slots = showcaseSlots([tree('a', 0), tree('b', 1), tree('c', 3), tree('d', 1, 90)])
    expect(slots).toHaveLength(6)
    expect(slots.slice(0, 3).map((s) => (s.kind === 'trophy' ? s.tree.slug : null))).toEqual(['c', 'd', 'b'])
    expect(slots.slice(3).every((s) => s.kind === 'locked')).toBe(true)
  })

  it('keeps the minimum shelf when nothing is earned yet', () => {
    const slots = showcaseSlots([tree('a', 0)])
    expect(slots).toHaveLength(6)
    expect(slots.every((s) => s.kind === 'locked')).toBe(true)
  })

  it('grows in whole rows past the minimum', () => {
    const many = Array.from({ length: 7 }, (_, i) => tree(`t${i}`, 1))
    const slots = showcaseSlots(many)
    expect(slots).toHaveLength(9)
    expect(slots.filter((s) => s.kind === 'trophy')).toHaveLength(7)
  })
})
