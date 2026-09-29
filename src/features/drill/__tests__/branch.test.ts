import { describe, expect, it } from 'vitest'
import { GetDrillSessionDto } from '../dto/GetDrillSessionDto'
import { collectBranch } from '../lib/branch'

const NODE = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'

//  cell ─┬─ mito
//        └─ nucleus ── dna
//  energy
const NODES = [
  { id: 'cell', parentId: null },
  { id: 'mito', parentId: 'cell' },
  { id: 'nucleus', parentId: 'cell' },
  { id: 'dna', parentId: 'nucleus' },
  { id: 'energy', parentId: null },
]

describe('collectBranch', () => {
  it('returns the node and all of its descendants', () => {
    expect(collectBranch(NODES, 'cell')).toEqual(new Set(['cell', 'mito', 'nucleus', 'dna']))
    expect(collectBranch(NODES, 'nucleus')).toEqual(new Set(['nucleus', 'dna']))
  })

  it('returns only the node for a leaf', () => {
    expect(collectBranch(NODES, 'energy')).toEqual(new Set(['energy']))
  })

  it('terminates on an A → B → A cycle (the DB does not block those)', () => {
    const cyclic = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]
    expect(collectBranch(cyclic, 'a')).toEqual(new Set(['a', 'b']))
  })
})

describe('GetDrillSessionDto nodeId', () => {
  it('is optional and must be a uuid when present', () => {
    expect(GetDrillSessionDto.parse({ slug: 'cell-biology-101' })).toEqual({ slug: 'cell-biology-101', limit: 20, includeMastered: false })
    expect(GetDrillSessionDto.parse({ slug: 'cell-biology-101', nodeId: NODE })).toEqual({
      slug: 'cell-biology-101',
      nodeId: NODE,
      limit: 20,
      includeMastered: false,
    })
    expect(GetDrillSessionDto.safeParse({ slug: 'cell-biology-101', nodeId: 'not-a-uuid' }).success).toBe(false)
  })
})
