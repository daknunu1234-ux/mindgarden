import type { DrillTag } from '@/shared/lib/trapEngine'
import type { GardenerLevel } from '../lib/gardenerLevel'
import type { MasteryLevel } from '../lib/masteryRules'
import type { Streaks } from '../lib/streak'

export type { MasteryLevel }

export type GradedAnswer = { isCorrect: boolean; correctTag: DrillTag }

// submitDrillResult payload (API SPEC.md §6).
export type DrillResult = GradedAnswer & {
  masteryLevel: MasteryLevel
  previousMasteryLevel: MasteryLevel
  mistakeCount: number
  // Current daily streak after this answer; null if it couldn't be saved (the answer still counts).
  streakCount: number | null
}

// getFarmHud payload: gardener level + daily streak for the farm HUD.
// coins: 🪙 5 per mastery step (display only, nothing to spend yet).
export type FarmHud = { level: GardenerLevel; streak: Streaks; coins: number }
