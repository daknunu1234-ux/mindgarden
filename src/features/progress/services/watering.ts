import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { localDay, resolveTimeZone } from '@/shared/lib/localDay'
import type { Database } from '@/shared/types/database.types'
import type { ActionResult } from '@/shared/types/result'
import type { Streaks } from '../lib/streak'
import { recordDeckPracticeDay } from './fruit'
import { recordPracticeDay } from './streak'

type Client = SupabaseClient<Database>
const UNIQUE_VIOLATION = '23505'

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

// Marks statements practised now, as a drill answer's progress row does, without touching mastery:
// a row that exists gets a fresh last_practiced_at; a statement never practised gets its row at 0/5
// (the same as no row). This is what lifts the farm's 💧 "needs watering" badge and a tree's withering
// (both read the newest last_practiced_at). Never fails the caller: errors are only logged.
export async function touchPractised(supabase: Client, userId: string, itemIds: readonly string[], now: Date = new Date()): Promise<void> {
  const ids = [...new Set(itemIds)]
  if (ids.length === 0) return
  const at = now.toISOString()
  const { data: existing, error: readError } = await supabase.from('user_progress').select('knowledge_item_id').eq('user_id', userId).in('knowledge_item_id', ids)
  if (readError) {
    console.error('[progress] touchPractised read failed', readError.code, readError.message)
    return
  }
  const have = new Set((existing ?? []).map((r) => r.knowledge_item_id))
  const update = ids.filter((id) => have.has(id))
  const insert = ids.filter((id) => !have.has(id))
  if (update.length > 0) {
    const { error } = await supabase.from('user_progress').update({ last_practiced_at: at }).eq('user_id', userId).in('knowledge_item_id', update)
    if (error) console.error('[progress] touchPractised update failed', error.code, error.message)
  }
  if (insert.length > 0) {
    const { error } = await supabase.from('user_progress').insert(insert.map((id) => ({ user_id: userId, knowledge_item_id: id, mastery_level: 0, last_practiced_at: at })))
    // Lost a race with a drill answer for one of them: that row is fresh already.
    if (error && error.code !== UNIQUE_VIOLATION) console.error('[progress] touchPractised insert failed', error.code, error.message)
  }
}
