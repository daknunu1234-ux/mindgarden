import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listDeckItemIds } from '@/features/decks/server'
import type { Database } from '@/shared/types/database.types'
import { ok, type ActionResult } from '@/shared/types/result'
import { summarizeDeckProgress, type DeckProgress } from '../lib/deckProgress'
import { fetchMasteryLevels } from './levels'

// Mastery per deck for the player; anonymous players (userId null) get all zeros.
export async function listProgressByDecks(
  supabase: SupabaseClient<Database>,
  userId: string | null,
  deckIds: string[],
): Promise<ActionResult<DeckProgress[]>> {
  const decks = await listDeckItemIds(supabase, deckIds)
  if (!decks.success) return decks

  let levels = new Map<string, number>()
  if (userId) {
    const fetched = await fetchMasteryLevels(
      supabase,
      userId,
      decks.data.flatMap((d) => d.items.map((i) => i.itemId)),
    )
    if (!fetched.success) return fetched
    levels = fetched.data
  }

  return ok(
    decks.data.map((deck) =>
      summarizeDeckProgress(
        deck.deckId,
        deck.items.map((i) => i.itemId),
        levels,
      ),
    ),
  )
}
