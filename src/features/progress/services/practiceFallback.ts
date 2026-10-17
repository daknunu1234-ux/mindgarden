import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { nextMastery, toMasteryLevel } from '../lib/masteryRules'
import { awardMasteryCoin, readCoins } from './coins'
import type { SavedAnswer } from './practice'

// Deploy order: this code can run before supabase/migrations/20261020000000_progress_rpc.sql creates
// record_practice_answer() / touch_practised(). Until then progress is saved the way it was before:
// with the player's own session, which still holds INSERT / UPDATE on user_progress (the lock,
// 20261020000100, only runs after the functions exist). Once the functions are there this file is
// never reached. Read-then-write here is not atomic; the functions are.

type Client = SupabaseClient<Database>
const UNIQUE_VIOLATION = '23505'

export async function savePracticeAnswerDirect(supabase: Client, userId: string, itemId: string, isCorrect: boolean): Promise<ActionResult<SavedAnswer>> {
  const { data: current, error: readError } = await supabase.from('user_progress').select('mastery_level').eq('user_id', userId).eq('knowledge_item_id', itemId).maybeSingle()
  if (readError) {
    console.error('[progress] read user_progress failed', readError.code, readError.message)
    return fail('INTERNAL_ERROR', 'Could not save progress')
  }
  const previousMasteryLevel = toMasteryLevel(current?.mastery_level ?? 0)
  const masteryLevel = nextMastery(previousMasteryLevel, isCorrect)
  const values = { mastery_level: masteryLevel, last_practiced_at: new Date().toISOString() }

  const updateRow = () => supabase.from('user_progress').update(values).eq('user_id', userId).eq('knowledge_item_id', itemId)
  let writeError = current ? (await updateRow()).error : null
  if (!current) {
    const inserted = await supabase.from('user_progress').insert({ user_id: userId, knowledge_item_id: itemId, ...values })
    // Lost a race with another first answer for this item: the row exists now, update it.
    writeError = inserted.error?.code === UNIQUE_VIOLATION ? (await updateRow()).error : inserted.error
  }
  if (writeError) {
    // 42501 = the lock migration ran without the functions: run 20261020000000_progress_rpc.sql.
    console.error('[progress] save user_progress failed', writeError.code, writeError.message)
    return fail('INTERNAL_ERROR', 'Could not save progress')
  }

  // The coin is claimed atomically by award_mastery_coin (0 when already paid); a coin failure never
  // fails the answer.
  const coins = masteryLevel === 5 ? await awardMasteryCoin(userId, itemId) : null
  if (coins?.success) return ok({ previousMasteryLevel, masteryLevel, ...coins.data })
  const balance = await readCoins(supabase, userId)
  return ok({ previousMasteryLevel, masteryLevel, coinsEarned: 0, totalCoins: balance.success ? balance.data : null })
}

export async function touchPractisedDirect(supabase: Client, userId: string, itemIds: readonly string[]): Promise<void> {
  const at = new Date().toISOString()
  const { data: existing, error: readError } = await supabase.from('user_progress').select('knowledge_item_id').eq('user_id', userId).in('knowledge_item_id', [...itemIds])
  if (readError) {
    console.error('[progress] touchPractised read failed', readError.code, readError.message)
    return
  }
  const have = new Set((existing ?? []).map((r) => r.knowledge_item_id))
  const update = itemIds.filter((id) => have.has(id))
  const insert = itemIds.filter((id) => !have.has(id))
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
