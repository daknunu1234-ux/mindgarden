import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { ok, type ActionResult } from '@/shared/types/result'
import type { DrillSubmission } from '../dto/DrillSubmissionDto'
import type { DrillResult } from '../types'
import { claimStreakReward } from './coins'
import { gradeWithTree } from './grading'
import { savePracticeAnswer } from './practice'
import { waterTree } from './watering'

// Grades the answer, then saves it: the statement's level moves ±1 and, on first mastery, its 🪙
// coin is paid, in one database transaction (practice.ts savePracticeAnswer → record_practice_answer).
// Progress only, updated in place: the level and when it was last reviewed. Nothing else about the
// answer is stored: no per-answer row, no timing, no pick, no mistake tally.
export async function recordDrillResult(
  supabase: SupabaseClient<Database>,
  userId: string,
  submission: DrillSubmission,
): Promise<ActionResult<DrillResult>> {
  // Owner-only: a visitor's answer on someone else's tree is refused before anything is saved.
  const gradedWithTree = await gradeWithTree(supabase, submission, userId)
  if (!gradedWithTree.success) return gradedWithTree
  const graded = gradedWithTree.data.answer

  const saved = await savePracticeAnswer(supabase, userId, submission.itemId, graded.isCorrect)
  if (!saved.success) return saved

  // Any saved answer (right or wrong) waters the tree for today: no penalty for mistakes (watering.ts:
  // today's practice day, and the tree's own one, so tomorrow it bears fruit). A finished Daily Rush
  // waters the same way.
  const { today, streak } = await waterTree(supabase, userId, { deckId: gradedWithTree.data.deckId, timeZone: submission.timeZone })
  const streakCount = streak.success ? streak.data.current : null

  // Watering on a milestone day (7, 30, every 100) pays the streak bonus, once that day. It runs
  // after the mastery coin, so its total is the newest balance.
  const bonus = streak.success ? await claimStreakReward(userId, streak.data, today) : null

  return ok({
    ...graded,
    masteryLevel: saved.data.masteryLevel,
    previousMasteryLevel: saved.data.previousMasteryLevel,
    streakCount,
    coinsEarned: saved.data.coinsEarned,
    streakReward: bonus?.coinsEarned ?? 0,
    totalCoins: bonus ? bonus.totalCoins : saved.data.totalCoins,
  })
}
