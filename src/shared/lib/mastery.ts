// The per-item mastery scale, shared by every feature that shows or computes it (progress saves
// it, drill filters and celebrates it, mindmap / garden / profile display it). DB CHECK: 0–5
// (migration 20260928000400_mastery_scale_5).
//
// One correct answer climbs one step, a wrong answer drops one (even from 5/5), so an item is
// "mastered" after 5 net correct answers.
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5

export const MAX_MASTERY = 5 as const

export const MASTERY_NAMES: Record<MasteryLevel, string> = {
  0: 'Seed',
  1: 'Sprout',
  2: 'Seedling',
  3: 'Sapling',
  4: 'Young Tree',
  5: 'Mighty Root',
}

// Clamps any stored or averaged number into a whole level 0–5 (the DB CHECK enforces the range).
export function toMasteryLevel(value: number): MasteryLevel {
  if (!Number.isFinite(value)) return value > 0 ? MAX_MASTERY : 0
  return Math.min(MAX_MASTERY, Math.max(0, Math.trunc(value))) as MasteryLevel
}

// Fully mastered: 5/5. Such items sit out normal practice rounds (review mode brings them back).
export const isMastered = (level: number | null | undefined): boolean => level != null && level >= MAX_MASTERY

// "n/5" for badges and gauges.
export const masteryFraction = (level: number) => `${Number.isInteger(level) ? level : level.toFixed(1)}/${MAX_MASTERY}`
