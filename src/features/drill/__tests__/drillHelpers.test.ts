import { describe, expect, it } from 'vitest'
import { generateTraps } from '@/shared/lib/trapEngine'
import { drillSeed } from '../lib/drillSeed'
import { splitMutation } from '../lib/splitMutation'
import { DrillSubmissionDto as CheckDrillAnswerDto } from '@/features/progress'
import { GetDrillSessionDto } from '../dto/GetDrillSessionDto'

const ITEM = '6f1c2a8e-2b1e-4c8a-9d3f-1a2b3c4d5e6f'

describe('drillSeed', () => {
  it('is stable for the same item and session, and differs across sessions', () => {
    expect(drillSeed(ITEM, 'sess-1')).toBe(drillSeed(ITEM, 'sess-1'))
    expect(drillSeed(ITEM, 'sess-1')).not.toBe(drillSeed(ITEM, 'sess-2'))
  })

  it('produces a seed the answer DTO accepts', () => {
    const parsed = CheckDrillAnswerDto.safeParse({ itemId: ITEM, seed: drillSeed(ITEM, 'x'), tag: 'A' })
    expect(parsed.success).toBe(true)
  })

  it('lets the grader re-derive the same correct tag from the seed', () => {
    const stmt = 'Khi nhiệt độ tăng, áp suất khí lớn hơn.'
    const seed = drillSeed(ITEM, 'sess-1')
    const shown = generateTraps(stmt, {}, seed)
    const graded = generateTraps(stmt, {}, seed)
    if (!shown.ok || !graded.ok) throw new Error('expected traps')
    expect(graded.correctTag).toBe(shown.correctTag)
  })
})

describe('splitMutation', () => {
  it('isolates the changed words', () => {
    expect(splitMutation('Khi nhiệt độ giảm, áp suất tăng.', 'Khi nhiệt độ tăng, áp suất tăng.')).toEqual({
      before: 'Khi nhiệt độ ',
      changed: 'giảm,',
      after: ' áp suất tăng.',
    })
  })

  it('handles multi-word changes and different lengths', () => {
    expect(splitMutation('ATP is not DNA.', 'ATP is DNA.')).toEqual({
      before: 'ATP is ',
      changed: 'not ',
      after: 'DNA.',
    })
  })

  it('returns no change for identical text', () => {
    expect(splitMutation('Same text.', 'Same text.')).toEqual({ before: 'Same text.', changed: '', after: '' })
  })
})

describe('drill DTOs', () => {
  it('accepts a slug or a deck id, with a default round size of 10', () => {
    expect(GetDrillSessionDto.parse({ slug: 'cell-biology-101' })).toEqual({ slug: 'cell-biology-101', limit: 10, includeMastered: false })
    expect(GetDrillSessionDto.parse({ deckId: ITEM, limit: '5' })).toEqual({ deckId: ITEM, limit: 5, includeMastered: false })
  })

  it('turns review mode on only when asked (includeMastered: true)', () => {
    expect(GetDrillSessionDto.parse({ slug: 'ok', includeMastered: true }).includeMastered).toBe(true)
    expect(GetDrillSessionDto.safeParse({ slug: 'ok', includeMastered: 'yes' }).success).toBe(false)
  })

  it('rejects bad input', () => {
    expect(GetDrillSessionDto.safeParse({}).success).toBe(false)
    expect(GetDrillSessionDto.safeParse({ slug: 'Bad Slug' }).success).toBe(false)
    // An unknown round size falls back to 10 instead of failing the round.
    expect(GetDrillSessionDto.parse({ slug: 'ok', limit: 99 }).limit).toBe(10)
    // Questions have up to four choices (A–D) now; anything else is refused.
    expect(CheckDrillAnswerDto.safeParse({ itemId: ITEM, seed: 'abc', tag: 'D' }).success).toBe(true)
    expect(CheckDrillAnswerDto.safeParse({ itemId: ITEM, seed: 'abc', tag: 'E' }).success).toBe(false)
    expect(CheckDrillAnswerDto.safeParse({ itemId: 'nope', seed: 'abc', tag: 'A' }).success).toBe(false)
  })
})
