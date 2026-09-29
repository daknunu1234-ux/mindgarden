import { describe, expect, it } from 'vitest'
import { DrillSubmissionDto } from '../dto/DrillSubmissionDto'
import { isMastered } from '@/shared/lib/mastery'
import { MASTERY_NAMES, MAX_MASTERY, nextMastery, toMasteryLevel } from '../lib/masteryRules'

describe('nextMastery (0–5 scale)', () => {
  it('climbs one level per correct answer', () => {
    expect(nextMastery(0, true)).toBe(1)
    expect(nextMastery(2, true)).toBe(3)
    expect(nextMastery(4, true)).toBe(5)
  })

  it('caps mastery at 5 and floors at 0', () => {
    expect(MAX_MASTERY).toBe(5)
    expect(nextMastery(5, true)).toBe(5)
    expect(nextMastery(0, false)).toBe(0)
  })

  it('drops one level on a wrong answer, even from 5/5', () => {
    expect(nextMastery(5, false)).toBe(4)
    expect(nextMastery(1, false)).toBe(0)
  })

  it('needs five correct answers from a seed to reach Mighty Root', () => {
    let level = toMasteryLevel(0)
    for (let i = 0; i < 4; i++) level = nextMastery(level, true)
    expect(isMastered(level)).toBe(false)
    level = nextMastery(level, true)
    expect(level).toBe(5)
    expect(MASTERY_NAMES[level]).toBe('Mighty Root')
    expect(isMastered(level)).toBe(true)
  })

  it('names every level', () => {
    expect(Object.keys(MASTERY_NAMES)).toHaveLength(6)
  })
})

describe('toMasteryLevel', () => {
  it('clamps out-of-range values', () => {
    expect(toMasteryLevel(-2)).toBe(0)
    expect(toMasteryLevel(7)).toBe(5)
    expect(toMasteryLevel(4.9)).toBe(4)
    expect(toMasteryLevel(Number.NaN)).toBe(0)
  })

  it('keeps old 0–3 values as they are (no rescaling)', () => {
    expect(toMasteryLevel(3)).toBe(3)
    expect(isMastered(3)).toBe(false)
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
