import { MAX_MASTERY } from './masteryRules'

// 🪙 Gold coins (pure, unit-tested). One coin the first time a player masters an item (5/5), once
// per item ever. The database decides and pays (record_practice_answer → award_mastery_coin); this is
// the same rule in TypeScript, for tests.
export const COINS_PER_MASTERED_ITEM = 1

export function shouldAwardMasteryCoin({ next, alreadyAwarded }: { previous: number; next: number; alreadyAwarded: boolean }): boolean {
  // Depends on "is it at 5/5 now, and unpaid" rather than on the step itself: an item that was
  // mastered before coins existed (and missed the backfill) still pays once; a paid one never again.
  return next === MAX_MASTERY && !alreadyAwarded
}
