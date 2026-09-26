import { describe, expect, it } from 'vitest'
import { DrillSubmissionDto } from '../dto/DrillSubmissionDto'
import { MASTERY_NAMES, nextMastery, toMasteryLevel } from '../lib/masteryRules'

describe('nextMastery', () => {
  it('climbs one level per correct answer', () => {
    expect(nextMastery(0, true)).toBe(1)
    expect(nextMastery(1, true)).toBe(2)
    expect(nextMastery(2, true)).toBe(3)
  })

  it('caps mastery at 3 and floors at 0', () => {
    expect(nextMastery(3, true)).toBe(3)
    expect(nextMastery(0, false)).toBe(0)
  })

  it('drops one level on a wrong answer', () => {
    expect(nextMastery(3, false)).toBe(2)
    expect(nextMastery(1, false)).toBe(0)
  })

  it('reaches Mighty Root after three correct answers from a seed', () => {
    let level = toMasteryLevel(0)
    for (let i = 0; i < 3; i++) level = nextMastery(level, true)
    expect(MASTERY_NAMES[level]).toBe('Mighty Root')
  })
})

describe('toMasteryLevel', () => {
  it('clamps out-of-range values', () => {
    expect(toMasteryLevel(-2)).toBe(0)
    expect(toMasteryLevel(7)).toBe(3)
    expect(toMasteryLevel(2.9)).toBe(2)
  })
})

describe('DrillSubmissionDto', () => {
  const itemId = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'

  it('accepts { itemId, seed, tag }', () => {
    expect(DrillSubmissionDto.safeParse({ itemId, seed: 'j123z2', tag: 'B' }).success).toBe(true)
  })

  it('does not accept a client-side isCorrect instead of a tag', () => {
    expect(DrillSubmissionDto.safeParse({ itemId, isCorrect: true }).success).toBe(false)
  })

  it('strips unknown fields such as userId', () => {
    const parsed = DrillSubmissionDto.parse({ itemId, seed: 'abc', tag: 'A', userId: 'someone-else' })
    expect(parsed).toEqual({ itemId, seed: 'abc', tag: 'A' })
  })
})
