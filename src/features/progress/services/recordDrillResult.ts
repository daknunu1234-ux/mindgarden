import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { DrillSubmission } from '../dto/DrillSubmissionDto'
import { shouldAwardMasteryCoin } from '../lib/coins'
import { nextMastery, toMasteryLevel } from '../lib/masteryRules'
import type { DrillResult } from '../types'
import { awardMasteryCoin, readCoins } from './coins'
import { gradeSubmission } from './grading'
import { recordPracticeDay } from './streak'

const UNIQUE_VIOLATION = '23505'
const UNDEFINED_COLUMN = '42703'

// Grades the answer, saves the player's user_progress row, then (on first mastery) pays the
// item's 🪙 coin. Read-then-write is not atomic for mastery: two simultaneous submits for one item
// can lose one step (move to a SECURITY DEFINER RPC before leaderboards, DATABASE.md). The coin is
// safe either way: award_mastery_coin claims it atomically.
export async function recordDrillResult(
  supabase: SupabaseClient<Database>,
  userId: string,
  submission: DrillSubmission,
): Promise<ActionResult<DrillResult>> {
  const graded = await gradeSubmission(supabase, submission)
  if (!graded.success) return graded

  const readRow = (columns: string) =>
    supabase
      .from('user_progress')
      .select(columns)
      .eq('user_id', userId)
      .eq('knowledge_item_id', submission.itemId)
      .maybeSingle<{ mastery_level: number; mistake_count: number; coin_awarded_at?: string | null }>()
  let { data: current, error: readError } = await readRow('mastery_level, mistake_count, coin_awarded_at')
  // Deploy order: this code ships before migration 20260928000300 adds coin_awarded_at. Until then,
  // answers still save (no coins yet: the award function doesn't exist either).
  const coinsReady = readError?.code !== UNDEFINED_COLUMN
  if (!coinsReady) ({ data: current, error: readError } = await readRow('mastery_level, mistake_count'))

  if (readError) {
    console.error('[progress] read user_progress failed', readError)
    return fail('INTERNAL_ERROR', 'Could not save progress')
  }

  const previousMasteryLevel = toMasteryLevel(current?.mastery_level ?? 0)
  const masteryLevel = nextMastery(previousMasteryLevel, graded.data.isCorrect)
  const mistakeCount = (current?.mistake_count ?? 0) + (graded.data.isCorrect ? 0 : 1)
  const values = { mastery_level: masteryLevel, mistake_count: mistakeCount, last_practiced_at: new Date().toISOString() }

  // The row's identity (user, item) is never rewritten: players may update only these three
  // columns (migration 20260928000300), so no upsert here.
  const updateRow = () =>
    supabase.from('user_progress').update(values).eq('user_id', userId).eq('knowledge_item_id', submission.itemId)
  let writeError = current ? (await updateRow()).error : null
  if (!current) {
    const inserted = await supabase.from('user_progress').insert({ user_id: userId, knowledge_item_id: submission.itemId, ...values })
    // Lost a race with another first answer for this item: the row exists now, update it.
    writeError = inserted.error?.code === UNIQUE_VIOLATION ? (await updateRow()).error : inserted.error
  }

  if (writeError) {
    // 23503 = FK violation: no public.users row (handle_new_user trigger missing?).
    // 23514 = CHECK violation: the database still caps mastery at 3 (run 20260928000400_mastery_scale_5.sql).
    if (writeError.code === '23514') console.error('[progress] mastery above 3 rejected: run supabase/migrations/20260928000400_mastery_scale_5.sql')
    console.error('[progress] save user_progress failed', writeError.code, writeError.message)
    return fail('INTERNAL_ERROR', 'Could not save progress')
  }

  // Any saved answer (right or wrong) waters the tree for today: no penalty for mistakes.
  const [streak, coins] = await Promise.all([
    recordPracticeDay(supabase, userId, submission.timeZone),
    !coinsReady
      ? Promise.resolve(fail('INTERNAL_ERROR', 'Coins are not set up yet'))
      : shouldAwardMasteryCoin({ previous: previousMasteryLevel, next: masteryLevel, alreadyAwarded: current?.coin_awarded_at != null })
        ? awardMasteryCoin(userId, submission.itemId)
        : readCoins(supabase, userId).then((r) => (r.success ? ok({ coinsEarned: 0, totalCoins: r.data }) : r)),
  ])
  const streakCount = streak.success ? streak.data.current : null

  // Coins never block the answer: on failure the player sees 0 earned and an unknown total.
  return ok({
    ...graded.data,
    masteryLevel,
    previousMasteryLevel,
    mistakeCount,
    streakCount,
    coinsEarned: coins.success ? coins.data.coinsEarned : 0,
    totalCoins: coins.success ? coins.data.totalCoins : null,
  })
}
