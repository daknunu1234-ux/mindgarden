'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { AnswerDailyRushDto } from '../dto/RushDto'
import { answerRush } from '../services/rush'
import type { RushAnswer } from '../types'

// Auth: Required. One pick of the player's running Daily Rush (tag null = their clock ran out). The
// server rebuilds the card and grades it; the database's clock decides timeouts. A right answer in
// time returns the next card; anything else ends the run and pays its streak in 🪙, atomically.
// No revalidatePath: it would re-render the page mid-run. Errors: VALIDATION_FAILED,
// AUTH_UNAUTHORIZED, RUSH_NOT_ACTIVE, INTERNAL_ERROR.
export async function answerDailyRush(input: unknown): Promise<ActionResult<RushAnswer>> {
  const parsed = AnswerDailyRushDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to play the Daily Rush')

  return answerRush(supabase, user.id, parsed.data)
}
