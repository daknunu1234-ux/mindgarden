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

  it('counts a Mighty Root only when every item of that root is at 3/3', () => {
    const levels = new Map([
      ['i1', 3],
      ['i2', 3], // n1: 3 + 3 → Mighty Root
      ['i3', 2], // n2: 2 → not yet
      ['i4', 3], // n3: 3 → Mighty Root
    ])
    const s = summarizeGarden(DECKS, levels)
    expect(s.mightyRootCount).toBe(2)
    expect(s.trees.map((t) => t.mightyRoots)).toEqual([1, 1, 0])
  })

  it('weights overall mastery by item, not by tree', () => {
    // bio: 3 + 3 + 0 = 6 of 9; chem: 0 of 3 → overall 6 / 12 = 50%, per tree 67% and 0%.
    const s = summarizeGarden(DECKS, new Map([['i1', 3], ['i2', 3]]))
    expect(s.masteryPercent).toBe(50)
    expect(s.trees.map((t) => t.masteryPercent)).toEqual([67, 0, 0])
  })

  it('reaches 100% when everything is mastered', () => {
    const levels = new Map(['i1', 'i2', 'i3', 'i4'].map((id) => [id, 3]))
    expect(summarizeGarden(DECKS, levels)).toMatchObject({ masteryPercent: 100, mightyRootCount: 3 })
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
