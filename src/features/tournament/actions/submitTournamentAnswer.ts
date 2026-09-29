'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { SubmitTournamentAnswerDto } from '../dto/TournamentDto'
import { recordTournamentAnswer } from '../services/answers'
import type { TournamentAnswer } from '../types'

// Auth: Required, and never the host. Grades one pick of a Mind Tournament round on someone
// else's public, hosting tree and saves it to the contestant's isolated tournament progress
// (user_progress, streaks and coins are untouched). Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED,
// AUTH_FORBIDDEN (the host), TOURNAMENT_CLOSED, TOURNAMENT_GRADUATED, DECK_NOT_FOUND,
// ITEM_NOT_FOUND, INTERNAL_ERROR.
export async function submitTournamentAnswer(input: unknown): Promise<ActionResult<TournamentAnswer>> {
  const parsed = SubmitTournamentAnswerDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to compete in the Mind Tournament')

  return recordTournamentAnswer(supabase, user.id, parsed.data)
}
