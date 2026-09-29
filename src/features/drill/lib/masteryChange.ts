import { isMastered } from '@/shared/lib/mastery'
import type { DrillProgress } from '../types'

// Pure helpers for how one saved answer moved an item's mastery (drives stats and celebrations).
type LevelChange = Pick<DrillProgress, 'masteryLevel' | 'previousMasteryLevel'>

// The item's saved mastery went up (triggers the level-up particle burst).
export const leveledUp = (progress: LevelChange | null): boolean =>
  progress !== null && progress.masteryLevel > progress.previousMasteryLevel

// The item just became a Mighty Root (5/5). Re-mastering after a drop counts too (celebration only;
// coins are paid once per item, server-side).
export const becameMighty = (progress: LevelChange | null): boolean =>
  progress !== null && isMastered(progress.masteryLevel) && !isMastered(progress.previousMasteryLevel)

// What the watering scene shows after an answer.
export type WaterMood = 'idle' | 'checking' | 'golden' | 'practice'
