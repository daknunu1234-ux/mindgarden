import type { DrillProgress } from '../types'

// Pure helpers for how one saved answer moved an item's mastery (drives stats and celebrations).

// The item's saved mastery went up (triggers the level-up particle burst).
export const leveledUp = (progress: DrillProgress | null): boolean =>
  progress !== null && progress.masteryLevel > progress.previousMasteryLevel

// The item just became a Mighty Root (3/3).
export const becameMighty = (progress: DrillProgress | null): boolean =>
  progress !== null && progress.masteryLevel === 3 && progress.previousMasteryLevel < 3

// What the watering scene shows after an answer.
export type WaterMood = 'idle' | 'checking' | 'golden' | 'practice'
