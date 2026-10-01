import type { DrillTag } from '@/shared/lib/trapEngine'
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
  // 🪙 paid by this answer: 1 the first time the item reaches 5/5, otherwise 0.
  coinsEarned: number
  // 🪙 streak bonus paid by this answer: the first watering on a milestone day (7, 30, every 100
  // days), otherwise 0.
  streakReward: number
  // Balance after this answer; null if it couldn't be read (the answer still counts).
  totalCoins: number | null
}

// getFarmHud payload: daily streak + 🪙 balance (users.coins) for the header and the farm.
// coinsAsOf: when the balance was read (epoch ms), so the client can tell it from newer live values.
export type FarmHud = { streak: Streaks; coins: number; coinsAsOf: number }
