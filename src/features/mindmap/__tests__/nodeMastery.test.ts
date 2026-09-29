import { describe, expect, it } from 'vitest'
import { isMightyRoot, nodeMastery, rootOpacity } from '../hooks/nodeMastery'

describe('nodeMastery', () => {
  it('averages the levels of the node items, missing items count as 0', () => {
    const node = { items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }
    expect(nodeMastery(node, { a: 3, b: 2 })).toBeCloseTo(5 / 3)
  })

  it('is null for a node without items', () => {
    expect(nodeMastery({ items: [] }, {})).toBeNull()
  })
})

describe('rootOpacity', () => {
  it('maps 0 → 0.35 and 5 → 1', () => {
    expect(rootOpacity(0)).toBeCloseTo(0.35)
    expect(rootOpacity(5)).toBeCloseTo(1)
    expect(rootOpacity(2.5)).toBeCloseTo(0.675)
  })

  it('is a Mighty Root only at 5/5', () => {
    expect(isMightyRoot(5)).toBe(true)
    expect(isMightyRoot(4.9)).toBe(false)
    expect(isMightyRoot(3)).toBe(false)
    expect(isMightyRoot(null)).toBe(false)
  })

  it('treats null (no items) as the floor and clamps out-of-range values', () => {
    expect(rootOpacity(null)).toBeCloseTo(0.35)
    expect(rootOpacity(9)).toBeCloseTo(1)
  })
})
