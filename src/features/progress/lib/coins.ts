import { MAX_MASTERY } from './masteryRules'

// 🪙 Gold coins (pure, unit-tested). One coin the first time a player masters an item (5/5), once
// per item ever. The database enforces the same rule atomically (award_mastery_coin, migration
// 20260928000300_user_coins); this decides whether the server should ask it at all.
export const COINS_PER_MASTERED_ITEM = 1

export function shouldAwardMasteryCoin({ next, alreadyAwarded }: { previous: number; next: number; alreadyAwarded: boolean }): boolean {
  // Depends on "is it at 5/5 now, and unpaid" rather than on the step itself: an item that was
  // mastered before coins existed (and missed the backfill) still pays once; a paid one never again.
  return next === MAX_MASTERY && !alreadyAwarded
}
