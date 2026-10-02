import type { QuestionKind } from '@/shared/lib/questionEngine'
import type { DrillChoice, DrillTag } from '@/shared/lib/trapEngine'
import type { RushOutcome } from '../lib/rules'

export type { DrillTag, RushOutcome }

// One card as the player sees it: no correct tag (the server grades the pick).
export type RushCard = {
  // 0-based position in the run = the streak when it is dealt.
  index: number
  kind: QuestionKind
  context: string[]
  prompt: string
  instruction: string
  choices: DrillChoice[]
}

// Whether the player may still play today, and how the last run went.
export type RushStatus = {
  playedToday: boolean
  // The latest run, once finished (today's when playedToday).
  lastRun: { day: string; streak: number; coins: number } | null
}

export type RushStart = {
  // The run's calendar day (the player's local day when it started): its id for every answer.
  day: string
  // Cards this run can deal (the tree's statements, at most RUSH_MAX_STREAK).
  total: number
  card: RushCard
}

export type RushAnswer = {
  isCorrect: boolean
  correctTag: DrillTag
  // The streak after this answer.
  streak: number
} & (
  | { finished: false; next: RushCard }
  // The run is over: why, what it paid and the purse after it.
  | { finished: true; outcome: RushOutcome; coinsEarned: number; totalCoins: number | null }
)
