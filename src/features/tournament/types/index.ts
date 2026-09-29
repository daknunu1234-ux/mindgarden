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
  // This answer completed the tree: engraved on the Bia Trạng Nguyên.
  justGraduated: boolean
}

// 🌱 Đang Rèn Luyện row (name already resolved: profile name or pseudonym, never an email).
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

// 📜 Bia Trạng Nguyên row.
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
}
