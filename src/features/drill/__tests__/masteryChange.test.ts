import { describe, expect, it } from 'vitest'
import { becameMighty, leveledUp } from '../lib/masteryChange'

describe('leveledUp', () => {
  it('is true only when saved mastery went up', () => {
    expect(leveledUp({ masteryLevel: 1, previousMasteryLevel: 0 })).toBe(true)
    expect(leveledUp({ masteryLevel: 3, previousMasteryLevel: 2 })).toBe(true)
    expect(leveledUp({ masteryLevel: 3, previousMasteryLevel: 3 })).toBe(false)
    expect(leveledUp({ masteryLevel: 1, previousMasteryLevel: 2 })).toBe(false)
  })

  it('is false when nothing was saved (signed out)', () => {
    expect(leveledUp(null)).toBe(false)
  })
})

describe('becameMighty', () => {
  it('is true only on the step into 3/3', () => {
    expect(becameMighty({ masteryLevel: 3, previousMasteryLevel: 2 })).toBe(true)
    expect(becameMighty({ masteryLevel: 3, previousMasteryLevel: 3 })).toBe(false)
    expect(becameMighty({ masteryLevel: 2, previousMasteryLevel: 1 })).toBe(false)
    expect(becameMighty(null)).toBe(false)
  })
})
