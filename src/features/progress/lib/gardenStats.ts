import { MAX_MASTERY, toMasteryLevel } from './masteryRules'

export type GardenDeckInput = {
  deck: { id: string; slug: string; title: string; treeType: string; isPublic: boolean }
  items: { itemId: string; nodeId: string }[]
}

export type GardenTree = {
  deckId: string
  slug: string
  title: string
  treeType: string
  isPublic: boolean
  itemCount: number
  // Items at 5/5 (resting from normal rounds).
  masteredCount: number
  masteryPercent: number
  mightyRoots: number
}

export type GardenStats = {
  treeCount: number
  itemCount: number
  // Roots (mindmap nodes) with at least one item whose average mastery is 5/5.
  mightyRootCount: number
  // Σ mastery_level / (5 × item count) × 100 over every owned item, rounded; 0 without items.
  masteryPercent: number
  trees: GardenTree[]
}

// getGardenStats payload: the garden totals plus daily streaks.
export type GardenStatsWithStreak = GardenStats & { currentStreak: number; bestStreak: number; practicedToday: boolean }

const percent = (total: number, count: number) => (count === 0 ? 0 : Math.round((total / (MAX_MASTERY * count)) * 100))

// Pure: owned decks + their item ids + the player's levels → profile stats.
// Unpractised items count as 0 (DATABASE.md "Tree health").
export function summarizeGarden(decks: GardenDeckInput[], levels: ReadonlyMap<string, number>): GardenStats {
  let itemCount = 0
  let levelTotal = 0
  let mightyRootCount = 0

  const trees = decks.map(({ deck, items }) => {
    const byNode = new Map<string, number[]>()
    let deckTotal = 0
    for (const { itemId, nodeId } of items) {
      const level = toMasteryLevel(levels.get(itemId) ?? 0)
      deckTotal += level
      byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), level])
    }
    // Average 5/5 means every item in the root is at level 5.
    const mightyRoots = [...byNode.values()].filter((ls) => ls.every((l) => l === MAX_MASTERY)).length
    const masteredCount = [...byNode.values()].flat().filter((l) => l === MAX_MASTERY).length

    itemCount += items.length
    levelTotal += deckTotal
    mightyRootCount += mightyRoots

    return {
      deckId: deck.id,
      slug: deck.slug,
      title: deck.title,
      treeType: deck.treeType,
      isPublic: deck.isPublic,
      itemCount: items.length,
      masteredCount,
      masteryPercent: percent(deckTotal, items.length),
      mightyRoots,
    }
  })

  return { treeCount: decks.length, itemCount, mightyRootCount, masteryPercent: percent(levelTotal, itemCount), trees }
}
