import { describe, expect, it } from 'vitest'
import { groupNeighborGardens, neighborName, visitHref, type SharedTree } from '../lib/neighbors'

const ME = 'me-0000'
const tree = (id: string, userId: string, day: number): SharedTree => ({
  id,
  slug: id,
  title: id.toUpperCase(),
  treeType: 'oak',
  userId,
  createdAt: `2026-09-${String(day).padStart(2, '0')}T00:00:00Z`,
})

describe('groupNeighborGardens', () => {
  const trees = [tree('mine', ME, 9), tree('b1', 'binh', 2), tree('c1', 'chi', 5), tree('b2', 'binh', 7)]

  it('groups shared trees by gardener and leaves out my own', () => {
    const gardens = groupNeighborGardens(trees, ME)
    expect(gardens.map((g) => g.ownerId)).toEqual(['binh', 'chi']) // binh's newest tree (day 7) beats chi's (day 5)
    expect(gardens[0].trees.map((t) => t.slug)).toEqual(['b2', 'b1'])
    expect(gardens.flatMap((g) => g.trees.map((t) => t.slug))).not.toContain('mine')
  })

  it('keeps everyone for a signed-out visitor', () => {
    expect(groupNeighborGardens(trees, null)).toHaveLength(3)
  })

  it('is empty without shared trees', () => {
    expect(groupNeighborGardens([], ME)).toEqual([])
  })
})

describe('neighborName', () => {
  it('is a stable, friendly name that reveals nothing personal', () => {
    const id = '22222222-2222-4222-8222-222222222222'
    expect(neighborName(id)).toBe(neighborName(id))
    expect(neighborName(id)).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
    expect(neighborName(id)).not.toContain('2222')
  })

  it('usually differs between gardeners', () => {
    const names = new Set(Array.from({ length: 30 }, (_, i) => neighborName(`gardener-${i}`)))
    expect(names.size).toBeGreaterThan(15)
  })
})

describe('visitHref', () => {
  it('links to the farm in visitor mode', () => {
    expect(visitHref('abc')).toBe('/?visit=abc')
  })
})
