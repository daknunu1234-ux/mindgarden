import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { ok, type ActionResult } from '@/shared/types/result'
import type { FarmHud } from '../types'
import { readCoins } from './coins'
import { loadStreaks } from './streak'

// The daily streak and the stored 🪙 balance. Read-only: loading the header or the farm never marks
// a practice day (only a saved practice answer does, services/streak.ts recordPracticeDay).
export async function loadFarmHud(supabase: SupabaseClient<Database>, userId: string): Promise<ActionResult<FarmHud>> {
  const [streaks, coins] = await Promise.all([loadStreaks(supabase, userId), readCoins(supabase, userId)])
  return ok({
    // A missing balance (e.g. before the coins migration) shows as 0 rather than hiding the HUD.
    coins: coins.success ? coins.data : 0,
    coinsAsOf: Date.now(),
    // A missing streak shows as 0 rather than hiding the HUD.
    streak: streaks.success ? streaks.data : { current: 0, best: 0, practicedToday: false, lastDay: null },
  })
}
