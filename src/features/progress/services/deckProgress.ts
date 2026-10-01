import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listDeckItemIds } from '@/features/decks/server'
import type { Database } from '@/shared/types/database.types'
import { ok, type ActionResult } from '@/shared/types/result'
import { summarizeDeckProgress, type DeckProgress, type PracticeRow } from '../lib/deckProgress'
import { localDay } from '../lib/streak'
import { readRipeTrees } from './fruit'
import { fetchPracticeRows } from './levels'
import { latestTimeZone } from './streak'

// Mastery per deck for the player; anonymous players (userId null) get all zeros.
export async function listProgressByDecks(
  supabase: SupabaseClient<Database>,
  userId: string | null,
  deckIds: string[],
): Promise<ActionResult<DeckProgress[]>> {
  const decks = await listDeckItemIds(supabase, deckIds)
  if (!decks.success) return decks

  let rows = new Map<string, PracticeRow>()
  let timeZone = 'UTC'
  if (userId) {
    const [fetched, zone] = await Promise.all([
      fetchPracticeRows(
        supabase,
        userId,
        decks.data.flatMap((d) => d.items.map((i) => i.itemId)),
      ),
      latestTimeZone(supabase, userId),
    ])
    if (!fetched.success) return fetched
    rows = fetched.data
    timeZone = zone
  }

  // "Watered today" and "fruit today" use the player's own calendar day (timezone of their latest
  // practice day).
  const clock = { today: localDay(new Date(), timeZone), timeZone }
  const ripe = userId ? await readRipeTrees(supabase, userId, decks.data.map((d) => d.deckId), clock.today) : new Set<string>()
  return ok(decks.data.map((deck) => summarizeDeckProgress(deck.deckId, deck.items, rows, clock, ripe)))
}
