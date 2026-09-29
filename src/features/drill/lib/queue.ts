import { isMastered } from '@/shared/lib/mastery'

// Pure practice-queue rule (unit-tested): normal rounds leave fully mastered items (5/5) resting;
// review mode (includeMastered) mixes them back in. Unpractised items count as level 0.
export function selectPracticeItems<T extends { itemId: string }>(
  candidates: readonly T[],
  levels: ReadonlyMap<string, number>,
  includeMastered: boolean,
): { queue: T[]; masteredCount: number } {
  const mastered = candidates.filter((c) => isMastered(levels.get(c.itemId)))
  return {
    queue: includeMastered ? [...candidates] : candidates.filter((c) => !isMastered(levels.get(c.itemId))),
    masteredCount: mastered.length,
  }
}

// Round order (pure): lowest mastery first, so the statements that need water most come first when
// the round is shorter than the queue. Stable: items on the same level keep their given (shuffled)
// order, so each round still varies. Unpractised items count as level 0.
export function orderByMastery<T extends { itemId: string }>(queue: readonly T[], levels: ReadonlyMap<string, number>): T[] {
  return queue
    .map((item, index) => ({ item, index, level: levels.get(item.itemId) ?? 0 }))
    .sort((a, b) => a.level - b.level || a.index - b.index)
    .map(({ item }) => item)
}

// Why a round came out empty, for the page: nothing drillable at all, or everything mastered.
export type EmptyRoundReason = 'no-items' | 'all-mastered'

export function emptyRoundReason(drillableCount: number, queueLength: number): EmptyRoundReason | null {
  if (drillableCount === 0) return 'no-items'
  if (queueLength === 0) return 'all-mastered'
  return null
}
