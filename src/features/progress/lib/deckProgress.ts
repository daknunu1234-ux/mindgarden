import { MAX_MASTERY, toMasteryLevel, type MasteryLevel } from './masteryRules'
import { localDay } from './streak'

export type PracticeRow = { level: number; lastPracticedAt: string | null }

// The player's "now" in their own timezone, for watering status.
export type LocalClock = { today: string; timeZone: string }

export type DeckProgress = {
  deckId: string
  // Σ mastery_level / (3 × itemCount) × 100, rounded; 0 when the deck has no items.
  masteryPercent: number
  itemCount: number
  items: { itemId: string; masteryLevel: MasteryLevel }[]
  // Roots whose items are all at 5/5.
  mightyRoots: number
  // Newest practice of any item in the deck, as the player's local day ('YYYY-MM-DD').
  lastPracticedDay: string | null
  // False also for never-practised decks: the farm shows a 💧 "needs watering" badge.
  practicedToday: boolean
  // Newest practice of any item (ISO timestamp), or null: drives withering (shared/lib/treeVitality).
  lastPracticedAt: string | null
  // Practised yesterday and not harvested today: the tree bears fruit (FRUIT_COINS 🪙).
  fruitReady: boolean
}

// Unpractised items count as level 0 (DATABASE.md "Tree health").
export function summarizeDeckProgress(
  deckId: string,
  items: readonly { itemId: string; nodeId: string }[],
  rows: ReadonlyMap<string, PracticeRow>,
  clock: LocalClock,
  ripe: ReadonlySet<string> = new Set(),
): DeckProgress {
  const byNode = new Map<string, number[]>()
  let total = 0
  let lastPracticedAt: string | null = null

  const levels = items.map(({ itemId, nodeId }) => {
    const row = rows.get(itemId)
    const masteryLevel = toMasteryLevel(row?.level ?? 0)
    total += masteryLevel
    byNode.set(nodeId, [...(byNode.get(nodeId) ?? []), masteryLevel])
    if (row?.lastPracticedAt && (!lastPracticedAt || row.lastPracticedAt > lastPracticedAt)) lastPracticedAt = row.lastPracticedAt
    return { itemId, masteryLevel }
  })

  const lastPracticedDay = lastPracticedAt ? localDay(new Date(lastPracticedAt), clock.timeZone) : null
  return {
    deckId,
    masteryPercent: items.length === 0 ? 0 : Math.round((total / (MAX_MASTERY * items.length)) * 100),
    itemCount: items.length,
    items: levels,
    mightyRoots: [...byNode.values()].filter((ls) => ls.every((l) => l === MAX_MASTERY)).length,
    lastPracticedDay,
    practicedToday: lastPracticedDay !== null && lastPracticedDay >= clock.today,
    lastPracticedAt,
    fruitReady: ripe.has(deckId),
  }
}
