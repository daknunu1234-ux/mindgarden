'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { RecordTreeVisitDto } from '../dto/TreeVisitDto'
import { recordVisit } from '../services/visits'

// Auth: Required. Called once by TreeVisitTracker when a signed-in player opens someone else's
// shared tree. `recorded` is false when the tree doesn't count (private, unknown, or your own).
export async function recordTreeVisit(input: unknown): Promise<ActionResult<{ recorded: boolean }>> {
  const parsed = RecordTreeVisitDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to keep track of visited gardens')

  return recordVisit(supabase, parsed.data)
}
