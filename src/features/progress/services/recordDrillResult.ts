import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { DrillSubmission } from '../dto/DrillSubmissionDto'
import { nextMastery, toMasteryLevel } from '../lib/masteryRules'
import type { DrillResult } from '../types'
import { gradeSubmission } from './grading'
import { recordPracticeDay } from './streak'

// Grades the answer, then upserts the player's user_progress row.
// Read-then-upsert is not atomic: two simultaneous submits for one item can lose one step.
// Move to a SECURITY DEFINER RPC before leaderboards (DATABASE.md).
export async function recordDrillResult(
  supabase: SupabaseClient<Database>,
  userId: string,
  submission: DrillSubmission,
): Promise<ActionResult<DrillResult>> {
  const graded = await gradeSubmission(supabase, submission)
  if (!graded.success) return graded

  const { data: current, error: readError } = await supabase
    .from('user_progress')
    .select('mastery_level, mistake_count')
    .eq('user_id', userId)
    .eq('knowledge_item_id', submission.itemId)
    .maybeSingle()

  if (readError) {
    console.error('[progress] read user_progress failed', readError)
    return fail('INTERNAL_ERROR', 'Could not save progress')
  }

  const previousMasteryLevel = toMasteryLevel(current?.mastery_level ?? 0)
  const masteryLevel = nextMastery(previousMasteryLevel, graded.data.isCorrect)
  const mistakeCount = (current?.mistake_count ?? 0) + (graded.data.isCorrect ? 0 : 1)

  const { error: writeError } = await supabase.from('user_progress').upsert(
    {
      user_id: userId,
      knowledge_item_id: submission.itemId,
      mastery_level: masteryLevel,
      mistake_count: mistakeCount,
      last_practiced_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,knowledge_item_id' },
  )

  if (writeError) {
    // 23503 = FK violation: no public.users row (handle_new_user trigger missing?).
    console.error('[progress] upsert user_progress failed', writeError.code, writeError.message)
    return fail('INTERNAL_ERROR', 'Could not save progress')
  }

  // Any saved answer (right or wrong) waters the tree for today: no penalty for mistakes.
  const streak = await recordPracticeDay(supabase, userId, submission.timeZone)
  const streakCount = streak.success ? streak.data.current : null

  return ok({ ...graded.data, masteryLevel, previousMasteryLevel, mistakeCount, streakCount })
}
