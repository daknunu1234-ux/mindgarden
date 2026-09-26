import { MAX_MASTERY, toMasteryLevel, type MasteryLevel } from './masteryRules'

export type DeckProgress = {
  deckId: string
  // Σ mastery_level / (3 × itemCount) × 100, rounded; 0 when the deck has no items.
  masteryPercent: number
  itemCount: number
  items: { itemId: string; masteryLevel: MasteryLevel }[]
}

// Unpractised items count as level 0 (DATABASE.md "Tree health").
export function summarizeDeckProgress(
  deckId: string,
  itemIds: string[],
  levels: ReadonlyMap<string, number>,
): DeckProgress {
  const items = itemIds.map((itemId) => ({ itemId, masteryLevel: toMasteryLevel(levels.get(itemId) ?? 0) }))
  const total = items.reduce((sum, item) => sum + item.masteryLevel, 0)
  const masteryPercent = items.length === 0 ? 0 : Math.round((total / (MAX_MASTERY * items.length)) * 100)
  return { deckId, masteryPercent, itemCount: items.length, items }
}
