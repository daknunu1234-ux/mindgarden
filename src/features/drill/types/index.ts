import type { MasteryLevel } from '@/shared/lib/mastery'
import type { QuestionKind } from '@/shared/lib/questionEngine'
import type { DrillChoice, DrillTag } from '@/shared/lib/trapEngine'

export type { DrillChoice, DrillTag, QuestionKind }

// Sent to the client: no correct tag (a choice is the true note, but nothing says which).
// Built by the question engine (shared/lib/questionEngine.ts): `kind` = cloze, recall-right,
// recall-left, statement, recognize or exact; `context` = the breadcrumb badge ([TypeScript ›
// Compiler]); `prompt` = the big line (a sentence with a blank, a key, a question); `instruction` =
// the hint under it.
export type DrillQuestion = {
  itemId: string
  nodeTitle: string
  kind: QuestionKind
  context: string[]
  prompt: string
  instruction: string
  seed: string
  // 2–4 choices (A–D).
  choices: DrillChoice[]
}

export type DrillSession = {
  deck: { id: string; slug: string; title: string; treeType: string }
  // 'tournament': answers go to the Mind Tournament (submitTournamentAnswer), never user_progress.
  mode: 'practice' | 'tournament'
  sessionId: string
  // Set when the round covers one branch (nodeId); null for the whole deck.
  focus: { nodeId: string; title: string } | null
  questions: DrillQuestion[]
  // Items the question engine could not ask at all (only a note with no two distinct words or letters).
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
