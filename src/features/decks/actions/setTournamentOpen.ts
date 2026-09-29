'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { SetTournamentOpenDto } from '../dto/SetTournamentOpenDto'
import { setDeckTournament } from '../services/authoring'
import type { Deck } from '../types'

// Auth: Required (deck owner only, AUTH_FORBIDDEN otherwise). Opens or closes the tree's Mind
// Tournament; opening needs a public tree (VALIDATION_FAILED "Share the tree ... first").
export async function setTournamentOpen(input: unknown): Promise<ActionResult<Deck>> {
  const parsed = SetTournamentOpenDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to host a tournament')

  const res = await setDeckTournament(supabase, user.id, parsed.data)
  if (res.success) revalidatePath(`/deck/${res.data.slug}`)
  return res
}
