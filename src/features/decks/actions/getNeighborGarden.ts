'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetNeighborGardenDto } from '../dto/GetDecksDto'
import { listNeighborDecks } from '../services/decks'
import type { Deck } from '../types'

// Auth: Optional. A neighbour's island for visitor mode: their PUBLIC trees only (never their
// private ones, even though the owner id comes from the URL).
export async function getNeighborGarden(input: unknown): Promise<ActionResult<Deck[]>> {
  const parsed = GetNeighborGardenDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  return listNeighborDecks(supabase, parsed.data)
}
