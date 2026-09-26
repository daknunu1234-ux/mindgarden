import { describe, expect, it } from 'vitest'
import { branchItemIds, displayMastery, isMightyRoot } from '../hooks/nodeMastery'
import { ancestorPath, layoutRoots, NODE_H, NODE_W } from '../hooks/useRootLayout'
import type { RootNodeView } from '../types'

const node = (id: string, items: string[] = [], children: RootNodeView[] = []): RootNodeView => ({
  id,
  title: id,
  items: items.map((i) => ({ id: i })),
  children,
})

// cell ─┬─ mito (i1, i2)
//       └─ nucleus ── dna (i3)
// energy (i4)
const TREE = [node('cell', [], [node('mito', ['i1', 'i2']), node('nucleus', [], [node('dna', ['i3'])])]), node('energy', ['i4'])]

describe('layoutRoots', () => {
  const layout = layoutRoots(TREE)
  const at = (id: string) => layout.nodes.find((n) => n.node.id === id)!
  const center = (id: string) => at(id).x + NODE_W / 2

  it('places every node once, in depth-first order', () => {
    expect(layout.nodes.map((n) => n.node.id)).toEqual(['cell', 'mito', 'nucleus', 'dna', 'energy'])
  })

  it('puts deeper roots lower and siblings on the same row', () => {
    expect(at('cell').y).toBe(at('energy').y)
    expect(at('mito').y).toBe(at('nucleus').y)
    expect(at('dna').y).toBeGreaterThan(at('nucleus').y)
  })

  it('centers a parent over its first and last child', () => {
    expect(center('cell')).toBe((center('mito') + center('nucleus')) / 2)
    expect(center('nucleus')).toBe(center('dna'))
  })

  it('never overlaps cards on the same row', () => {
    const rows = new Map<number, number[]>()
    for (const n of layout.nodes) rows.set(n.y, [...(rows.get(n.y) ?? []), n.x])
    for (const xs of rows.values()) {
      const sorted = [...xs].sort((a, b) => a - b)
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(NODE_W)
    }
  })

  it('fits every card inside the canvas', () => {
    for (const n of layout.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(0)
      expect(n.x + NODE_W).toBeLessThanOrEqual(layout.width)
      expect(n.y + NODE_H).toBeLessThanOrEqual(layout.height)
    }
  })

  it('connects top-level roots to the trunk and children to their parent', () => {
    expect(layout.edges.filter((e) => e.from === null).map((e) => e.to)).toEqual(['cell', 'energy'])
    expect(layout.edges.find((e) => e.to === 'dna')?.from).toBe('nucleus')
    for (const e of layout.edges) expect(e.path).toMatch(/^M [\d.]+ [\d.]+ C /)
  })

  it('handles an empty tree', () => {
    expect(layoutRoots([])).toMatchObject({ nodes: [], edges: [], height: 0 })
  })
})

describe('ancestorPath', () => {
  it('returns the node and its ancestors', () => {
    expect(ancestorPath(layoutRoots(TREE), 'dna')).toEqual(new Set(['dna', 'nucleus', 'cell']))
    expect(ancestorPath(layoutRoots(TREE), null)).toEqual(new Set())
  })
})

describe('branch mastery', () => {
  const [cell, energy] = TREE

  it('collects the items of a whole branch', () => {
    expect(branchItemIds(cell)).toEqual(['i1', 'i2', 'i3'])
  })

  it('uses own items first, then the branch average for grouping roots', () => {
    const levels = { i1: 3, i2: 1, i3: 3, i4: 2 }
    expect(displayMastery(energy, levels)).toBe(2)
    expect(displayMastery(cell, levels)).toBeCloseTo(7 / 3) // (3 + 1 + 3) / 3
    expect(displayMastery(node('empty'), levels)).toBeNull()
  })

  it('marks Mighty Roots only at full mastery', () => {
    expect(isMightyRoot(3)).toBe(true)
    expect(isMightyRoot(2.99)).toBe(false)
    expect(isMightyRoot(null)).toBe(false)
  })
})

describe('trunk and root crown', () => {
  const layout = layoutRoots(TREE)

  it('starts at the ground line and drops to a crown straight below the trunk', () => {
    expect(layout.trunk.y).toBe(0)
    expect(layout.crown.x).toBe(layout.trunk.x)
    expect(layout.crown.y).toBeGreaterThan(0)
  })

  it('branches every top-level root out of the crown, above the first row of cards', () => {
    const top = layout.edges.filter((e) => e.from === null)
    for (const e of top) {
      expect([e.x1, e.y1]).toEqual([layout.crown.x, layout.crown.y])
      expect(e.y2).toBeGreaterThan(layout.crown.y)
    }
  })

  it('centers the trunk over the top-level roots', () => {
    const tops = layout.nodes.filter((n) => n.parentId === null).map((n) => n.x + NODE_W / 2)
    expect(layout.trunk.x).toBe((tops[0] + tops[tops.length - 1]) / 2)
  })
})
