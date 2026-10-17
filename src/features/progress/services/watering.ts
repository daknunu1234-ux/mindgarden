import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { localDay, resolveTimeZone } from '@/shared/lib/localDay'
import type { Database } from '@/shared/types/database.types'
import type { ActionResult } from '@/shared/types/result'
import type { Streaks } from '../lib/streak'
import { recordDeckPracticeDay } from './fruit'
import { recordPracticeDay } from './streak'

type Client = SupabaseClient<Database>

// Watering a tree: one practised local day. Every saved drill answer does it (recordDrillResult), and
// so does a finished Daily Rush with at least one answered card (rush answerRush): today becomes a
// practice day (the 🔥 watering streak, practice_days) and the tree's own practice day (it bears 🍎
// fruit tomorrow, deck_practice_days). Both are once a day: watering again changes nothing. Returns the
// day used and the streaks (for the milestone bonus, coins claimStreakReward).
export async function waterTree(
  supabase: Client,
  userId: string,
  { deckId, timeZone }: { deckId: string; timeZone: string | undefined },
  now: Date = new Date(),
): Promise<{ today: string; streak: ActionResult<Streaks> }> {
  const today = localDay(now, resolveTimeZone(timeZone))
  const [streak] = await Promise.all([recordPracticeDay(supabase, userId, timeZone), recordDeckPracticeDay(userId, deckId, today)])
  return { today, streak }
}
