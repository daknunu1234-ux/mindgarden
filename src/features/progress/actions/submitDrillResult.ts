'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { DrillSubmissionDto } from '../dto/DrillSubmissionDto'
import { recordDrillResult } from '../services/recordDrillResult'
import type { DrillResult } from '../types'

// Auth: Required. Grades on the server and saves mastery for the signed-in player.
export async function submitDrillResult(input: unknown): Promise<ActionResult<DrillResult>> {
  const parsed = DrillSubmissionDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to save your progress')

  return recordDrillResult(supabase, user.id, parsed.data)
}
