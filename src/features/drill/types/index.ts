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
  questions: DrillQuestion[]
  // Items skipped because the engine could not build 2 traps (INSUFFICIENT_MUTATIONS).
  skippedCount: number
}

export type DrillAnswer = { isCorrect: boolean; correctTag: DrillTag }
