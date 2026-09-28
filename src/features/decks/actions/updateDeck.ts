'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { UpdateDeckDto } from '../dto/UpdateDeckDto'
import { updateDeckSettings } from '../services/authoring'
import type { Deck } from '../types'

// Auth: Required (deck owner). Change title, description, tree species or visibility.
export async function updateDeck(input: unknown): Promise<ActionResult<Deck>> {
  const parsed = UpdateDeckDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  return updateDeckSettings(supabase, user.id, parsed.data)
}
