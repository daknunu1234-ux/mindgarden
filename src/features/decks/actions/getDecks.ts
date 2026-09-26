'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetDecksDto } from '../dto/GetDecksDto'
import { listDecks } from '../services/decks'
import type { Deck } from '../types'

// Auth: Optional. Anonymous callers see public decks; RLS adds the caller's own decks.
export async function getDecks(input: unknown = {}): Promise<ActionResult<Deck[]>> {
  const parsed = GetDecksDto.safeParse(input ?? {})
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  return listDecks(supabase, parsed.data)
}
