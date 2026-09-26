import { describe, expect, it } from 'vitest'
import { allNodeIds, countDescendants, pruneCollapsed } from '../hooks/collapse'
import { branchItemIds } from '../hooks/nodeMastery'
import { layoutRoots } from '../hooks/useRootLayout'
import { MAX_ZOOM, MIN_ZOOM, stepZoom } from '../hooks/zoom'
import type { RootNodeView } from '../types'

const node = (id: string, items: string[] = [], children: RootNodeView[] = []): RootNodeView => ({
  id,
  title: id,
  items: items.map((i) => ({ id: i })),
  children,
})

const TREE = [node('cell', [], [node('mito', ['i1']), node('nucleus', [], [node('dna', ['i2'])])]), node('energy', ['i3'])]

describe('collapse', () => {
  it('counts every root below a node', () => {
    expect(countDescendants(TREE[0])).toBe(3)
    expect(countDescendants(TREE[1])).toBe(0)
  })

  it('hides the children of collapsed roots from the layout', () => {
    const pruned = pruneCollapsed(TREE, new Set(['nucleus']))
    expect(layoutRoots(pruned).nodes.map((n) => n.node.id)).toEqual(['cell', 'mito', 'nucleus', 'energy'])
    expect(layoutRoots(pruneCollapsed(TREE, new Set(['cell']))).nodes.map((n) => n.node.id)).toEqual(['cell', 'energy'])
  })

  it('makes a collapsed wide tree narrower', () => {
    expect(layoutRoots(pruneCollapsed(TREE, new Set(['cell']))).width).toBeLessThan(layoutRoots(TREE).width)
  })

  it('does not mutate the original tree (mastery and drills still see the full branch)', () => {
    pruneCollapsed(TREE, new Set(['cell']))
    expect(branchItemIds(TREE[0])).toEqual(['i1', 'i2'])
  })

  it('lists all ids for "collapse all"', () => {
    expect(allNodeIds(TREE)).toEqual(['cell', 'mito', 'nucleus', 'dna', 'energy'])
  })
})

describe('stepZoom', () => {
  it('steps by 0.25 without drifting', () => {
    expect(stepZoom(1, 1)).toBe(1.25)
    expect(stepZoom(1, -1)).toBe(0.75)
    expect(stepZoom(stepZoom(stepZoom(1, -1), -1), 1)).toBe(0.75)
  })

  it('clamps to the allowed range', () => {
    expect(stepZoom(MAX_ZOOM, 1)).toBe(MAX_ZOOM)
    expect(stepZoom(MIN_ZOOM, -1)).toBe(MIN_ZOOM)
  })
})
