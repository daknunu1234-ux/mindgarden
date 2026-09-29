'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetCommunityDecksDto } from '../dto/GetDecksDto'
import { listCommunityDecks } from '../services/decks'
import type { Deck } from '../types'

// Auth: Optional. Community Gardens: public trees of other gardeners (is_public = true and
// user_id ≠ the session user). Signed out → every public tree.
export async function getCommunityDecks(input: unknown = {}): Promise<ActionResult<Deck[]>> {
  const parsed = GetCommunityDecksDto.safeParse(input ?? {})
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return listCommunityDecks(supabase, user?.id ?? null, parsed.data)
}
