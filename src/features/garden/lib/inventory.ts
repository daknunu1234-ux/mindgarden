// The farm's fruit counter and export feedback (pure, unit-tested).
import { FRUIT_PER_HARVEST } from '@/shared/lib/economy'
import { CANDY_EXPORT_COINS } from './farmEconomy'

// The 🍎 count right after harvesting one tree (shown at once; the server's total replaces it):
// unknown stays unknown.
export const fruitAfterHarvest = (fruit: number | null): number | null => (fruit === null ? null : fruit + FRUIT_PER_HARVEST)

// A harvest refused by the server: the count goes back to what it was.
export const fruitAfterRefusal = (before: number | null): number | null => before

// The floating rewards over the Seaport when the train delivers: one "+15 🪙" per candy box, at most
// `max` of them (a big delivery says the total on the last one instead of flooding the screen).
export function exportRewards(candyShipped: number, max = 4): string[] {
  const n = Math.max(0, Math.floor(candyShipped))
  if (n === 0) return []
  if (n <= max) return Array.from({ length: n }, () => `+${CANDY_EXPORT_COINS} 🪙`)
  return [...Array.from({ length: max - 1 }, () => `+${CANDY_EXPORT_COINS} 🪙`), `+${(n - (max - 1)) * CANDY_EXPORT_COINS} 🪙`]
}
