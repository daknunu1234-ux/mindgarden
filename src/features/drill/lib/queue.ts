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

// Why a round came out empty, for the page: nothing drillable at all, or everything mastered.
export type EmptyRoundReason = 'no-items' | 'all-mastered'

export function emptyRoundReason(drillableCount: number, queueLength: number): EmptyRoundReason | null {
  if (drillableCount === 0) return 'no-items'
  if (queueLength === 0) return 'all-mastered'
  return null
}
