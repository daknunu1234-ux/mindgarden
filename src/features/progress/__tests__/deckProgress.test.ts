import { describe, expect, it } from 'vitest'
import { GetProgressByDecksDto } from '../dto/GetProgressByDecksDto'
import { summarizeDeckProgress } from '../lib/deckProgress'

const DECK = '11111111-1111-4111-8111-111111111111'

describe('summarizeDeckProgress', () => {
  it('computes Σ level / (3 × items) × 100', () => {
    const levels = new Map([
      ['a', 3],
      ['b', 1],
    ])
    // (3 + 1 + 0) / 9 = 44.4…% → 44
    expect(summarizeDeckProgress(DECK, ['a', 'b', 'c'], levels)).toEqual({
      deckId: DECK,
      masteryPercent: 44,
      itemCount: 3,
      items: [
        { itemId: 'a', masteryLevel: 3 },
        { itemId: 'b', masteryLevel: 1 },
        { itemId: 'c', masteryLevel: 0 },
      ],
    })
  })

  it('is 0 for a deck without items and 100 when everything is mastered', () => {
    expect(summarizeDeckProgress(DECK, [], new Map()).masteryPercent).toBe(0)
    expect(summarizeDeckProgress(DECK, ['a', 'b'], new Map([['a', 3], ['b', 3]])).masteryPercent).toBe(100)
  })

  it('counts every item as 0 for an anonymous player', () => {
    const r = summarizeDeckProgress(DECK, ['a', 'b'], new Map())
    expect(r.masteryPercent).toBe(0)
    expect(r.items.every((i) => i.masteryLevel === 0)).toBe(true)
  })

  it('ignores progress rows for items outside the deck', () => {
    expect(summarizeDeckProgress(DECK, ['a'], new Map([['zzz', 3]])).masteryPercent).toBe(0)
  })
})

describe('GetProgressByDecksDto', () => {
  it('dedupes ids', () => {
    expect(GetProgressByDecksDto.parse({ deckIds: [DECK, DECK] })).toEqual({ deckIds: [DECK] })
  })

  it('requires 1–50 valid uuids', () => {
    expect(GetProgressByDecksDto.safeParse({ deckIds: [] }).success).toBe(false)
    expect(GetProgressByDecksDto.safeParse({ deckIds: ['nope'] }).success).toBe(false)
    expect(GetProgressByDecksDto.safeParse({ deckIds: Array(51).fill(DECK) }).success).toBe(false)
  })
})
