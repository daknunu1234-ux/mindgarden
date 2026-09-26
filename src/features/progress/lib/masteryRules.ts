// Mastery rules (DATABASE.md "Progress Use Cases"): correct → +1 up to 3, wrong → -1 down to 0.
export type MasteryLevel = 0 | 1 | 2 | 3

export const MAX_MASTERY: MasteryLevel = 3

export const MASTERY_NAMES: Record<MasteryLevel, string> = {
  0: 'Seed',
  1: 'Sprout',
  2: 'Sapling',
  3: 'Mighty Root',
}

// Clamps any stored integer into a valid level (the DB CHECK already enforces 0–3).
export function toMasteryLevel(value: number): MasteryLevel {
  return Math.min(MAX_MASTERY, Math.max(0, Math.trunc(value))) as MasteryLevel
}

export function nextMastery(level: MasteryLevel, isCorrect: boolean): MasteryLevel {
  return toMasteryLevel(isCorrect ? level + 1 : level - 1)
}
