import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { toMasteryLevel, type MasteryLevel } from '../lib/masteryRules'
import { savePracticeAnswerDirect, touchPractisedDirect } from './practiceFallback'

// The writers of user_progress. With migration 20261020000000_progress_rpc.sql applied, every write
// goes through its two functions (service role); migration 20261020000100_lock_progress_writes.sql
// then takes INSERT / UPDATE away from players, so a level can only move through a graded answer.
// Before the first migration (or without a service role key) the functions can't be called: progress
// is saved with the player's own session as before (practiceFallback.ts), so answers never fail on
// deploy order.

type Client = SupabaseClient<Database>
const MIGRATION = 'supabase/migrations/20261020000000_progress_rpc.sql'
const MISSING_FUNCTION = new Set(['PGRST202', '42883'])

// totalCoins: null when the balance couldn't be read (fallback path only).
export type SavedAnswer = { previousMasteryLevel: MasteryLevel; masteryLevel: MasteryLevel; coinsEarned: number; totalCoins: number | null }

// Saves one graded answer of a tree's owner: record_practice_answer() moves the statement's level
// ±1 under a row lock, stamps last_practiced_at and, on 5/5, claims its one-time 🪙 coin, all in one
// transaction. Callers grade first (grading.ts: owner only); the function checks the owner again.
export async function savePracticeAnswer(supabase: Client, userId: string, itemId: string, isCorrect: boolean): Promise<ActionResult<SavedAnswer>> {
  const admin = createAdminClient()
  if (!admin) {
    console.warn('[progress] savePracticeAnswer: SUPABASE_SERVICE_ROLE_KEY is not set, saving with the player session')
    return savePracticeAnswerDirect(supabase, userId, itemId, isCorrect)
  }
  const { data, error } = await admin.rpc('record_practice_answer', { p_user_id: userId, p_item_id: itemId, p_correct: isCorrect })
  if (error) {
    if (error.code && MISSING_FUNCTION.has(error.code)) {
      console.warn(`[progress] record_practice_answer() is missing, saving with the player session: run ${MIGRATION}`)
      return savePracticeAnswerDirect(supabase, userId, itemId, isCorrect)
    }
    if ((error.message ?? '').includes('ITEM_NOT_FOUND')) return fail('ITEM_NOT_FOUND', 'This statement can no longer be practised')
    // 23503 = FK violation: no public.users row (handle_new_user trigger missing?).
    console.error('[progress] record_practice_answer failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not save progress')
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    console.error('[progress] record_practice_answer returned no row')
    return fail('INTERNAL_ERROR', 'Could not save progress')
  }
  return ok({
    previousMasteryLevel: toMasteryLevel(row.previous_level),
    masteryLevel: toMasteryLevel(row.new_level),
    coinsEarned: row.coins_earned,
    totalCoins: row.total_coins,
  })
}

// Marks statements practised now, as a drill answer's progress row does, without touching mastery:
// a row that exists gets a fresh last_practiced_at; a statement never practised gets its row at 0/5
// (the same as no row). This is what lifts the farm's 💧 "needs watering" badge and a tree's withering
// (both read the newest last_practiced_at). Never fails the caller: errors are only logged.
export async function touchPractised(supabase: Client, userId: string, itemIds: readonly string[]): Promise<void> {
  const ids = [...new Set(itemIds)]
  if (ids.length === 0) return
  const admin = createAdminClient()
  if (!admin) return touchPractisedDirect(supabase, userId, ids)
  const { error } = await admin.rpc('touch_practised', { p_user_id: userId, p_item_ids: ids })
  if (!error) return
  if (error.code && MISSING_FUNCTION.has(error.code)) {
    console.warn(`[progress] touch_practised() is missing, saving with the player session: run ${MIGRATION}`)
    return touchPractisedDirect(supabase, userId, ids)
  }
  console.error('[progress] touch_practised failed', error.code, error.message)
}
