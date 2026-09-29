import type { MasteryLevel } from '@/shared/lib/mastery'
import type { DrillTag } from '@/shared/lib/trapEngine'

// One graded tournament answer (submitTournamentAnswer). Scores are the contestant's tournament
// progress on this tree only; user_progress, streaks and coins are never touched.
export type TournamentAnswer = {
  isCorrect: boolean
  correctTag: DrillTag
  masteryLevel: MasteryLevel
  previousMasteryLevel: MasteryLevel
  currentPoints: number
  maxPoints: number
  masteryPercentage: number | null
  daysCount: number
  isGraduated: boolean
  // This answer completed the tree: engraved in the Hall of Fame.
  justGraduated: boolean
}

// 🌱 Active Learners row (name already resolved: profile name or pseudonym, never an email).
export type ActiveBoardRow = {
  rank: number
  userId: string
  name: string
  currentPoints: number
  maxPoints: number
  masteryPercentage: number | null
  daysCount: number
  updatedAt: string
}

// 📜 Hall of Fame row.
export type HallOfFameRow = {
  rank: number
  userId: string
  name: string
  maxPoints: number
  daysCount: number
  graduatedAt: string
}

export type TournamentBoards = { active: ActiveBoardRow[]; hallOfFame: HallOfFameRow[] }

// The viewer's own standing on a tree (null when they haven't answered yet).
export type TournamentStanding = {
  currentPoints: number
  maxPoints: number
  masteryPercentage: number | null
  daysCount: number
  isGraduated: boolean
  graduatedAt: string | null
  // Place on its board (Hall of Fame for graduates, else Active Learners); null past the top 50
  // or when unknown (findStanding alone doesn't rank).
  rank?: number | null
}
