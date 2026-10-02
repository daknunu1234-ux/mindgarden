// Daily Rush rules (pure, unit-tested). The database enforces the same numbers
// (migration 20261008000000_daily_rush.sql; a test keeps them equal).
import { hashString, seededRandom, seededShuffle } from '@/shared/utils/seededRandom'

// Seconds a player has for each card.
export const RUSH_SECONDS = 8
export const RUSH_CARD_MS = RUSH_SECONDS * 1000
// Extra time the server allows for the answer to travel (the player's own clock still ends the card
// at RUSH_SECONDS). A pick that reaches the database later than this is a timeout whatever it was.
export const RUSH_GRACE_MS = 2500
export const RUSH_LIMIT_MS = RUSH_CARD_MS + RUSH_GRACE_MS
// The last seconds of a card beat like a heart.
export const RUSH_URGENT_SECONDS = 3
// A run never asks a statement twice and stops at this many cards: the most a run can pay. Without
// it a two-statement tree would pay without end.
export const RUSH_MAX_STREAK = 30
// A run with an unanswered card this old was abandoned (tab closed): it is paid what it had.
export const RUSH_STALE_MS = RUSH_LIMIT_MS + 5000

// 🪙 for a run: one per card answered in a row.
export const rushCoins = (streak: number): number => Math.min(Math.max(0, Math.floor(Number.isFinite(streak) ? streak : 0)), RUSH_MAX_STREAK)

// The order a run deals its cards in: the tree's statements shuffled by the run's seed (sorted first,
// so database order never matters), each at most once, RUSH_MAX_STREAK at most.
export function rushOrder(itemIds: readonly string[], seed: string): string[] {
  const unique = [...new Set(itemIds)].sort()
  return seededShuffle(unique, seededRandom(`rush:${seed}`)).slice(0, RUSH_MAX_STREAK)
}

// The question-engine seed of the card at `index`: the server rebuilds exactly the card it dealt.
export const rushQuestionSeed = (itemId: string, seed: string, index: number): string => hashString(`${itemId}:${seed}:${index}`).toString(36)

export type RushOutcome = 'wrong' | 'timeout' | 'complete'

// The result screen's headline.
export function rushHeadline(outcome: RushOutcome, streak: number): string {
  if (outcome === 'complete') return 'Perfect rush!'
  if (streak === 0) return outcome === 'timeout' ? "Time's up!" : 'So close!'
  return outcome === 'timeout' ? "Time's up!" : 'Rush over!'
}

// Whether the card's clock is in its last, heart-beating seconds.
export const isUrgent = (remainingMs: number): boolean => remainingMs > 0 && remainingMs <= RUSH_URGENT_SECONDS * 1000
