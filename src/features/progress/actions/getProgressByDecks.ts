'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetProgressByDecksDto } from '../dto/GetProgressByDecksDto'
import type { DeckProgress } from '../lib/deckProgress'
import { listProgressByDecks } from '../services/deckProgress'

// Auth: Optional. Signed out → every masteryPercent and masteryLevel is 0.
export async function getProgressByDecks(input: unknown): Promise<ActionResult<DeckProgress[]>> {
  const parsed = GetProgressByDecksDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return listProgressByDecks(supabase, user?.id ?? null, parsed.data.deckIds)
}
