import { describe, expect, it } from 'vitest'
import { allNodeIds, collapsibleNodeIds, indexNodes } from '../hooks/collapse'
import type { RootNodeView } from '../types'

const node = (id: string, items: string[] = [], children: RootNodeView[] = []): RootNodeView => ({
  id,
  title: id,
  items: items.map((i) => ({ id: i })),
  children,
})

const TREE = [node('cell', [], [node('mito', ['i1']), node('empty')]), node('energy', ['i2'])]

describe('collapse helpers', () => {
  it('lists every root depth-first', () => {
    expect(allNodeIds(TREE)).toEqual(['cell', 'mito', 'empty', 'energy'])
  })

  it('offers only roots with content for "Collapse all"', () => {
    expect(collapsibleNodeIds(TREE)).toEqual(['cell', 'mito', 'energy'])
  })

  it('indexes the full tree by id', () => {
    const index = indexNodes(TREE)
    expect([...index.keys()]).toEqual(['cell', 'mito', 'empty', 'energy'])
    expect(index.get('mito')?.items).toEqual([{ id: 'i1' }])
  })
})
