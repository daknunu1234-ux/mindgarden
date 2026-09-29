import type { MasteryLevel } from '@/shared/lib/mastery'
import type { DrillChoice, DrillTag } from '@/shared/lib/trapEngine'

export type { DrillChoice, DrillTag }

// Sent to the client: no correct statement, no correct tag.
export type DrillQuestion = {
  itemId: string
  nodeTitle: string
  prompt: string
  seed: string
  choices: DrillChoice[]
}

export type DrillSession = {
  deck: { id: string; slug: string; title: string; treeType: string }
  sessionId: string
  // Set when the round covers one branch (nodeId); null for the whole deck.
  focus: { nodeId: string; title: string } | null
  questions: DrillQuestion[]
  // Items skipped because the engine found no trap at all (INSUFFICIENT_MUTATIONS).
  skippedCount: number
  // Drillable items the player has at 5/5: resting in normal rounds, mixed in when reviewing.
  masteredCount: number
  // Review mode ("Review Mastered 🌿"): mastered items are in the queue too.
  includeMastered: boolean
}

export type DrillAnswer = { isCorrect: boolean; correctTag: DrillTag }

// Saved progress for one answer (signed-in players only).
export type DrillProgress = {
  masteryLevel: MasteryLevel
  previousMasteryLevel: MasteryLevel
  // 🪙 paid by this answer (1 on an item's first 5/5, else 0).
  coinsEarned: number
}
