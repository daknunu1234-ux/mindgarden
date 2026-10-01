import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { previousDay } from '@/shared/lib/localDay'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'

// Tree fruit (migration 20261003000000_tree_fruit.sql): a tree the owner practised yesterday bears
// fruit today, harvested once for FRUIT_COINS 🪙. Writes go through the service role (players can't
// write deck_practice_days, tree_harvests or users.coins); reads use the player's own client (RLS).

const MIGRATION = 'supabase/migrations/20261003000000_tree_fruit.sql'
// Postgres undefined_table / PostgREST unknown function: the migration hasn't run yet.
const missing = (code?: string) => code === '42P01' || code === 'PGRST202' || code === 'PGRST205'

// Logs that the owner practised this tree today (their local day). First answer of the day wins;
// later ones change nothing. Never fails the answer: errors are only logged.
export async function recordDeckPracticeDay(userId: string, deckId: string, day: string): Promise<void> {
  const admin = createAdminClient()
  if (!admin) {
    console.error('[progress] recordDeckPracticeDay: SUPABASE_SERVICE_ROLE_KEY is not set, tree practice day not saved')
    return
  }
  const { error } = await admin
    .from('deck_practice_days')
    .upsert({ user_id: userId, deck_id: deckId, day }, { onConflict: 'user_id,deck_id,day', ignoreDuplicates: true })
  if (error) console.error(`[progress] recordDeckPracticeDay failed${missing(error.code) ? `: run ${MIGRATION}` : ''}`, error.code, error.message)
}

// The trees (of these) whose fruit is ready today: practised yesterday, not harvested today.
// Before the migration (or on any read error) no tree has fruit; the farm simply shows none.
export async function readRipeTrees(
  supabase: SupabaseClient<Database>,
  userId: string,
  deckIds: readonly string[],
  today: string,
): Promise<ReadonlySet<string>> {
  if (deckIds.length === 0) return new Set()
  const [practised, harvested] = await Promise.all([
    supabase.from('deck_practice_days').select('deck_id').eq('user_id', userId).eq('day', previousDay(today)).in('deck_id', [...deckIds]),
    supabase.from('tree_harvests').select('deck_id').eq('user_id', userId).eq('day', today).in('deck_id', [...deckIds]),
  ])
  const error = practised.error ?? harvested.error
  if (error) {
    console.error(`[progress] readRipeTrees failed${missing(error.code) ? `: run ${MIGRATION}` : ''}`, error.code, error.message)
    return new Set()
  }
  return ripeTrees(
    (practised.data ?? []).map((r) => r.deck_id),
    (harvested.data ?? []).map((r) => r.deck_id),
  )
}

// Pure: practised yesterday, minus harvested today.
export function ripeTrees(practisedYesterday: readonly string[], harvestedToday: readonly string[]): ReadonlySet<string> {
  const done = new Set(harvestedToday)
  return new Set(practisedYesterday.filter((id) => !done.has(id)))
}

// Collects today's fruit of one tree: harvest_tree_fruit() checks the owner, yesterday's practice and
// that it's today's first harvest, then pays in the same transaction.
export async function harvestFruit(userId: string, deckId: string, today: string): Promise<ActionResult<{ coinsEarned: number; totalCoins: number }>> {
  const admin = createAdminClient()
  if (!admin) {
    console.error('[progress] harvestFruit: SUPABASE_SERVICE_ROLE_KEY is not set')
    return fail('INTERNAL_ERROR', 'Could not harvest this tree')
  }
  const { data, error } = await admin.rpc('harvest_tree_fruit', { p_user_id: userId, p_deck_id: deckId, p_today: today })
  if (error) {
    if (error.message.includes('FRUIT_NOT_READY')) return fail('FRUIT_NOT_READY', 'No fruit on this tree today: practise it today and come back tomorrow')
    if (error.message.includes('DECK_NOT_FOUND')) return fail('DECK_NOT_FOUND', 'Tree not found')
    console.error(`[progress] harvest_tree_fruit failed${missing(error.code) ? `: run ${MIGRATION}` : ''}`, error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not harvest this tree')
  }
  const row = data?.[0]
  if (!row) return fail('INTERNAL_ERROR', 'Could not harvest this tree')
  return ok({ coinsEarned: row.coins_earned, totalCoins: row.total_coins })
}
