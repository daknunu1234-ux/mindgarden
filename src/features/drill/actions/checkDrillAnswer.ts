'use server'

import { DrillSubmissionDto } from '@/features/progress'
import { gradeSubmission } from '@/features/progress/server'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import type { DrillAnswer } from '../types'

// Auth: Public. Grades one answer without saving anything, for signed-out players.
// Signed-in players use progress.submitDrillResult, which grades the same way and saves.
export async function checkDrillAnswer(input: unknown): Promise<ActionResult<DrillAnswer>> {
  const parsed = DrillSubmissionDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  return gradeSubmission(supabase, parsed.data)
}
