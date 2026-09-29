import { describe, expect, it } from 'vitest'
import { GetProgressByDecksDto } from '../dto/GetProgressByDecksDto'
import { summarizeDeckProgress, type PracticeRow } from '../lib/deckProgress'

const DECK = '11111111-1111-4111-8111-111111111111'
const UTC = { today: '2026-09-28', timeZone: 'UTC' }

// root n1: a, b · root n2: c
const ITEMS = [
  { itemId: 'a', nodeId: 'n1' },
  { itemId: 'b', nodeId: 'n1' },
  { itemId: 'c', nodeId: 'n2' },
]
const row = (level: number, lastPracticedAt: string | null = null): PracticeRow => ({ level, lastPracticedAt })

describe('summarizeDeckProgress', () => {
  it('computes Σ level / (5 × items) × 100', () => {
    const rows = new Map([
      ['a', row(5)],
      ['b', row(2)],
    ])
    // (5 + 2 + 0) / 15 = 46.6…% → 47
    expect(summarizeDeckProgress(DECK, ITEMS, rows, UTC)).toMatchObject({
      deckId: DECK,
      masteryPercent: 47,
      itemCount: 3,
      items: [
        { itemId: 'a', masteryLevel: 5 },
        { itemId: 'b', masteryLevel: 2 },
        { itemId: 'c', masteryLevel: 0 },
      ],
    })
  })

  it('is 0 for a deck without items and 100 only when everything is at 5/5', () => {
    expect(summarizeDeckProgress(DECK, [], new Map(), UTC).masteryPercent).toBe(0)
    const all = new Map(['a', 'b', 'c'].map((id) => [id, row(5)]))
    expect(summarizeDeckProgress(DECK, ITEMS, all, UTC)).toMatchObject({ masteryPercent: 100, mightyRoots: 2 })
    // The old top level (3) is 60% on the new scale.
    const old = new Map(['a', 'b', 'c'].map((id) => [id, row(3)]))
    expect(summarizeDeckProgress(DECK, ITEMS, old, UTC)).toMatchObject({ masteryPercent: 60, mightyRoots: 0 })
  })

  it('counts a Mighty Root only when every item of the root is at 5/5', () => {
    const rows = new Map([
      ['a', row(5)],
      ['b', row(4)],
      ['c', row(5)],
    ])
    expect(summarizeDeckProgress(DECK, ITEMS, rows, UTC).mightyRoots).toBe(1)
  })

  it('counts every item as 0 for an anonymous player', () => {
    const r = summarizeDeckProgress(DECK, ITEMS, new Map(), UTC)
    expect(r).toMatchObject({ masteryPercent: 0, mightyRoots: 0, lastPracticedDay: null, practicedToday: false })
  })

  it('ignores progress rows for items outside the deck', () => {
    expect(summarizeDeckProgress(DECK, [ITEMS[0]], new Map([['zzz', row(3)]]), UTC).masteryPercent).toBe(0)
  })
})

describe('watering status', () => {
  it('uses the newest practice of any item in the deck', () => {
    const rows = new Map([
      ['a', row(1, '2026-09-20T10:00:00Z')],
      ['c', row(1, '2026-09-28T09:00:00Z')],
    ])
    expect(summarizeDeckProgress(DECK, ITEMS, rows, UTC)).toMatchObject({
      lastPracticedDay: '2026-09-28',
      practicedToday: true,
    })
  })

  it('needs watering when the last practice was on an earlier day', () => {
    const rows = new Map([['a', row(2, '2026-09-27T23:00:00Z')]])
    expect(summarizeDeckProgress(DECK, ITEMS, rows, UTC)).toMatchObject({ practicedToday: false })
  })

  it("judges 'today' in the player's timezone", () => {
    // 23:00 UTC on the 27th is 06:00 on the 28th in Ho Chi Minh City.
    const rows = new Map([['a', row(2, '2026-09-27T23:00:00Z')]])
    const vn = { today: '2026-09-28', timeZone: 'Asia/Ho_Chi_Minh' }
    expect(summarizeDeckProgress(DECK, ITEMS, rows, vn)).toMatchObject({ lastPracticedDay: '2026-09-28', practicedToday: true })
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
