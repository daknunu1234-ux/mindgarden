'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { UpdateDeckDto } from '../dto/UpdateDeckDto'
import { updateDeckSettings, type UpdatedDeck } from '../services/authoring'

// Auth: Required (deck owner). Change title, description, tree species or visibility. Changing to a
// pricier species charges the difference (INSUFFICIENT_COINS when the purse is short); the result's
// `remainingCoins` is the purse after that charge (null when nothing was charged).
export async function updateDeck(input: unknown): Promise<ActionResult<UpdatedDeck>> {
  const parsed = UpdateDeckDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  return updateDeckSettings(supabase, user.id, parsed.data)
}
