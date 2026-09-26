import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listDeckItemIds } from '@/features/decks/server'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { summarizeDeckProgress, type DeckProgress } from '../lib/deckProgress'

// Keeps each `.in()` filter well under URL length limits (a UUID is 36 chars).
const ID_CHUNK = 150

// Mastery per deck for the player; anonymous players (userId null) get all zeros.
export async function listProgressByDecks(
  supabase: SupabaseClient<Database>,
  userId: string | null,
  deckIds: string[],
): Promise<ActionResult<DeckProgress[]>> {
  const decks = await listDeckItemIds(supabase, deckIds)
  if (!decks.success) return decks

  const levels = new Map<string, number>()
  const allItemIds = decks.data.flatMap((d) => d.items.map((i) => i.itemId))

  if (userId) {
    for (let i = 0; i < allItemIds.length; i += ID_CHUNK) {
      const { data, error } = await supabase
        .from('user_progress')
        .select('knowledge_item_id, mastery_level')
        .eq('user_id', userId)
        .in('knowledge_item_id', allItemIds.slice(i, i + ID_CHUNK))

      if (error) {
        console.error('[progress] listProgressByDecks failed', error)
        return fail('INTERNAL_ERROR', 'Could not load progress')
      }
      for (const row of data) levels.set(row.knowledge_item_id, row.mastery_level)
    }
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
