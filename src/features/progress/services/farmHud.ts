import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { coinsFromLevels, gardenerLevel, xpFromLevels } from '../lib/gardenerLevel'
import type { FarmHud } from '../types'
import { loadStreaks } from './streak'

// Level from every user_progress row of the player (any deck), plus the daily streak.
export async function loadFarmHud(supabase: SupabaseClient<Database>, userId: string): Promise<ActionResult<FarmHud>> {
  const [levels, streaks] = await Promise.all([
    supabase.from('user_progress').select('mastery_level').eq('user_id', userId),
    loadStreaks(supabase, userId),
  ])
  if (levels.error) {
    console.error('[progress] loadFarmHud failed', levels.error)
    return fail('INTERNAL_ERROR', 'Could not load your gardener level')
  }
  const masteryLevels = levels.data.map((r) => r.mastery_level)
  return ok({
    level: gardenerLevel(xpFromLevels(masteryLevels)),
    coins: coinsFromLevels(masteryLevels),
    // A missing streak shows as 0 rather than hiding the HUD.
    streak: streaks.success ? streaks.data : { current: 0, best: 0, practicedToday: false, lastDay: null },
  })
}
