import type { DrillTag } from '@/shared/lib/trapEngine'
import type { MasteryLevel } from '../lib/masteryRules'

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
