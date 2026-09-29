import { describe, expect, it } from 'vitest'
import { summarizeGarden, type GardenDeckInput } from '../lib/gardenStats'

const deck = (id: string, items: [string, string][], isPublic = true): GardenDeckInput => ({
  deck: { id, slug: `${id}-slug`, title: id.toUpperCase(), treeType: 'oak', isPublic },
  items: items.map(([itemId, nodeId]) => ({ itemId, nodeId })),
})

// Deck "bio": root n1 (i1, i2), root n2 (i3). Deck "chem": root n3 (i4). Deck "empty": nothing.
const DECKS = [
  deck('bio', [
    ['i1', 'n1'],
    ['i2', 'n1'],
    ['i3', 'n2'],
  ]),
  deck('chem', [['i4', 'n3']], false),
  deck('empty', []),
]

describe('summarizeGarden', () => {
  it('counts trees and items across owned decks', () => {
    const s = summarizeGarden(DECKS, new Map())
    expect(s.treeCount).toBe(3)
    expect(s.itemCount).toBe(4)
    expect(s.trees.map((t) => t.itemCount)).toEqual([3, 1, 0])
  })

  it('is all zeros before any practice', () => {
    const s = summarizeGarden(DECKS, new Map())
    expect(s).toMatchObject({ mightyRootCount: 0, masteryPercent: 0 })
    expect(s.trees.every((t) => t.masteryPercent === 0 && t.mightyRoots === 0)).toBe(true)
  })

  it('counts a Mighty Root only when every item of that root is at 5/5', () => {
    const levels = new Map([
      ['i1', 5],
      ['i2', 5], // n1: 5 + 5 → Mighty Root
      ['i3', 4], // n2: 4 → not yet
      ['i4', 5], // n3: 5 → Mighty Root
    ])
    const s = summarizeGarden(DECKS, levels)
    expect(s.mightyRootCount).toBe(2)
    expect(s.trees.map((t) => t.mightyRoots)).toEqual([1, 1, 0])
    expect(s.trees.map((t) => t.masteredCount)).toEqual([2, 1, 0])
  })

  it('weights overall mastery by item, not by tree', () => {
    // bio: 5 + 5 + 0 = 10 of 15; chem: 0 of 5 → overall 10 / 20 = 50%, per tree 67% and 0%.
    const s = summarizeGarden(DECKS, new Map([['i1', 5], ['i2', 5]]))
    expect(s.masteryPercent).toBe(50)
    expect(s.trees.map((t) => t.masteryPercent)).toEqual([67, 0, 0])
  })

  it('reaches 100% only when everything is at 5/5', () => {
    const levels = new Map(['i1', 'i2', 'i3', 'i4'].map((id) => [id, 5]))
    expect(summarizeGarden(DECKS, levels)).toMatchObject({ masteryPercent: 100, mightyRootCount: 3 })
    const old = new Map(['i1', 'i2', 'i3', 'i4'].map((id) => [id, 3]))
    expect(summarizeGarden(DECKS, old)).toMatchObject({ masteryPercent: 60, mightyRootCount: 0 })
  })

  it('handles a gardener with no trees', () => {
    expect(summarizeGarden([], new Map())).toEqual({
      treeCount: 0,
      itemCount: 0,
      mightyRootCount: 0,
      masteryPercent: 0,
      trees: [],
    })
  })

  it('keeps deck details for the tree list, including private trees', () => {
    const chem = summarizeGarden(DECKS, new Map()).trees[1]
    expect(chem).toMatchObject({ deckId: 'chem', slug: 'chem-slug', title: 'CHEM', isPublic: false })
  })
})
