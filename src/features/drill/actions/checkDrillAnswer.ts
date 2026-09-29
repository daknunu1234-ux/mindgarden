'use server'

import { DrillSubmissionDto } from '@/features/progress'
import { gradeSubmission } from '@/features/progress/server'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import type { DrillAnswer } from '../types'

// Auth: Optional, but only the deck's owner is graded (FORBIDDEN_VISITOR_PRACTICE otherwise).
// Grades one answer without saving, e.g. when the session expired mid-round. Signed-in owners
// normally use progress.submitDrillResult, which grades the same way and saves.
export async function checkDrillAnswer(input: unknown): Promise<ActionResult<DrillAnswer>> {
  const parsed = DrillSubmissionDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return gradeSubmission(supabase, parsed.data, user?.id ?? null)
}
