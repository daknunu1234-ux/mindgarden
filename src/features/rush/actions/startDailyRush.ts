'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { StartDailyRushDto } from '../dto/RushDto'
import { startRush } from '../services/rush'
import type { RushStart } from '../types'

// Auth: Required (the tree's owner). Claims today's one Daily Rush on this tree and deals the first
// card; its 8 seconds start now. Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, DECK_NOT_FOUND (not
// your tree), DRILL_NO_ITEMS, RUSH_ALREADY_PLAYED, INTERNAL_ERROR.
export async function startDailyRush(input: unknown): Promise<ActionResult<RushStart>> {
  const parsed = StartDailyRushDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to play the Daily Rush')

  return startRush(supabase, user.id, parsed.data)
}
