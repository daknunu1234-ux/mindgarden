'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { GetDecksDto } from '../dto/GetDecksDto'
import { listDecks } from '../services/decks'
import type { Deck } from '../types'

// Auth: Optional. The player's OWN garden: only decks whose user_id is the session user (public and
// private). Signed out → an empty garden. Other gardeners' shared trees: getCommunityDecks.
export async function getDecks(input: unknown = {}): Promise<ActionResult<Deck[]>> {
  const parsed = GetDecksDto.safeParse(input ?? {})
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ok([], { page: parsed.data.page, limit: parsed.data.limit, total: 0 })

  return listDecks(supabase, user.id, parsed.data)
}
