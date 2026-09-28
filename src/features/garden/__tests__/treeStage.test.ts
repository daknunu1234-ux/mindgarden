import { describe, expect, it } from 'vitest'
import { getTreeStage, TREE_STAGES } from '../hooks/useTreeStage'

describe('getTreeStage (5 stages)', () => {
  it('follows the documented ranges at every boundary', () => {
    const cases: [number, number][] = [
      [0, 1], [20, 1],
      [21, 2], [40, 2],
      [41, 3], [65, 3],
      [66, 4], [89, 4], [89.9, 4],
      [90, 5], [100, 5],
    ]
    for (const [pct, stage] of cases) expect(getTreeStage(pct), `${pct}%`).toBe(stage)
  })

  it('names every stage', () => {
    expect(Object.keys(TREE_STAGES)).toEqual(['1', '2', '3', '4', '5'])
    expect(TREE_STAGES[5].name).toBe('Golden Ancient Bloom')
  })
})
