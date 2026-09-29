import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { gardenerLevel, xpFromLevels } from '../lib/gardenerLevel'
import type { FarmHud } from '../types'
import { readCoins } from './coins'
import { loadStreaks } from './streak'

// Level from every user_progress row of the player (any deck), the daily streak, and the stored
// 🪙 balance.
export async function loadFarmHud(supabase: SupabaseClient<Database>, userId: string): Promise<ActionResult<FarmHud>> {
  const [levels, streaks, coins] = await Promise.all([
    supabase.from('user_progress').select('mastery_level').eq('user_id', userId),
    loadStreaks(supabase, userId),
    readCoins(supabase, userId),
  ])
  if (levels.error) {
    console.error('[progress] loadFarmHud failed', levels.error)
    return fail('INTERNAL_ERROR', 'Could not load your gardener level')
  }
  const masteryLevels = levels.data.map((r) => r.mastery_level)
  return ok({
    level: gardenerLevel(xpFromLevels(masteryLevels)),
    // A missing balance (e.g. before the coins migration) shows as 0 rather than hiding the HUD.
    coins: coins.success ? coins.data : 0,
    // A missing streak shows as 0 rather than hiding the HUD.
    streak: streaks.success ? streaks.data : { current: 0, best: 0, practicedToday: false, lastDay: null },
  })
}
