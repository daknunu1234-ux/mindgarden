import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listDeckItemIds, listOwnedDecks } from '@/features/decks/server'
import type { Database } from '@/shared/types/database.types'
import { ok, type ActionResult } from '@/shared/types/result'
import { summarizeGarden, type GardenStats, type GardenStatsWithStreak } from '../lib/gardenStats'
import { fetchMasteryLevels } from './levels'
import { loadStreaks } from './streak'

// Garden totals plus daily streaks. A streak read error shows 0 rather than hiding the garden.
export async function loadGardenStats(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ActionResult<GardenStatsWithStreak>> {
  const [garden, streaks] = await Promise.all([loadGarden(supabase, userId), loadStreaks(supabase, userId)])
  if (!garden.success) return garden
  const s = streaks.success ? streaks.data : { current: 0, best: 0, practicedToday: false }
  return ok({ ...garden.data, currentStreak: s.current, bestStreak: s.best, practicedToday: s.practicedToday })
}

// Stats over the trees the player planted (owned decks, public and private).
async function loadGarden(supabase: SupabaseClient<Database>, userId: string): Promise<ActionResult<GardenStats>> {
  const owned = await listOwnedDecks(supabase, userId)
  if (!owned.success) return owned
  if (owned.data.length === 0) return ok(summarizeGarden([], new Map()))

  const items = await listDeckItemIds(
    supabase,
    owned.data.map((d) => d.id),
  )
  if (!items.success) return items

  const levels = await fetchMasteryLevels(
    supabase,
    userId,
    items.data.flatMap((d) => d.items.map((i) => i.itemId)),
  )
  if (!levels.success) return levels

  // listDeckItemIds keeps the input order, so index i is owned.data[i].
  const decks = owned.data.map((deck, i) => ({ deck, items: items.data[i].items }))
  return ok(summarizeGarden(decks, levels.data))
}
