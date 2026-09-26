import type { DrillTag } from '@/shared/lib/trapEngine'
import type { MasteryLevel } from '../lib/masteryRules'

export type { MasteryLevel }

export type GradedAnswer = { isCorrect: boolean; correctTag: DrillTag }

// submitDrillResult payload (API SPEC.md §6). streakCount comes later with the admin client.
export type DrillResult = GradedAnswer & {
  masteryLevel: MasteryLevel
  previousMasteryLevel: MasteryLevel
  mistakeCount: number
}
