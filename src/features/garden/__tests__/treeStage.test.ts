import { describe, expect, it } from 'vitest'
import { getTreeStage } from '../hooks/useTreeStage'

describe('getTreeStage', () => {
  it('follows the documented ranges', () => {
    expect(getTreeStage(0)).toBe(1)
    expect(getTreeStage(25)).toBe(1)
    expect(getTreeStage(26)).toBe(2)
    expect(getTreeStage(50)).toBe(2)
    expect(getTreeStage(51)).toBe(3)
    expect(getTreeStage(80)).toBe(3)
    expect(getTreeStage(81)).toBe(4)
    expect(getTreeStage(100)).toBe(4)
  })
})
