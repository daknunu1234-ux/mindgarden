import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'

// 🪙 Gold coins live in public.users.coins (migration 20260928000300_user_coins). Players read
// their own balance with their session; only award_mastery_coin (service role) changes it.

const MISSING = new Set(['42703', '42883', 'PGRST202', 'PGRST204'])

function logCoinError(where: string, error: { code?: string; message?: string }) {
  if (error.code && MISSING.has(error.code)) {
    console.error(`[progress] ${where}: coins are missing, run supabase/migrations/20260928000300_user_coins.sql`)
  } else {
    console.error(`[progress] ${where} failed`, error.code, error.message)
  }
}

export type CoinAward = { coinsEarned: number; totalCoins: number }

// Pays the item's one-time mastery coin if it is at 5/5 and unpaid. The claim and the payment
// happen in one database call, so a repeat or concurrent answer pays 0.
export async function awardMasteryCoin(userId: string, itemId: string): Promise<ActionResult<CoinAward>> {
  const admin = createAdminClient()
  if (!admin) {
    console.error('[progress] awardMasteryCoin: SUPABASE_SERVICE_ROLE_KEY is not set, coin not paid')
    return fail('INTERNAL_ERROR', 'Could not pay your coin')
  }
  const { data, error } = await admin.rpc('award_mastery_coin', { p_user_id: userId, p_item_id: itemId })
  if (error) {
    logCoinError('awardMasteryCoin', error)
    return fail('INTERNAL_ERROR', 'Could not pay your coin')
  }
  const row = Array.isArray(data) ? data[0] : data
  return ok({ coinsEarned: row?.coins_earned ?? 0, totalCoins: row?.total_coins ?? 0 })
}

// Test top-up for the Coin Shop's dev mode (no payment yet). The action refuses it in production;
// dev_grant_coins is service-role only and capped at 100 per call in the database.
export async function grantDevCoins(userId: string, amount: number): Promise<ActionResult<number>> {
  const admin = createAdminClient()
  if (!admin) {
    console.error('[progress] grantDevCoins: SUPABASE_SERVICE_ROLE_KEY is not set')
    return fail('INTERNAL_ERROR', 'Could not add test coins')
  }
  const { data, error } = await admin.rpc('dev_grant_coins', { p_user_id: userId, p_amount: amount })
  if (error) {
    if (error.code === 'PGRST202' || error.code === '42883') {
      console.error('[progress] grantDevCoins: run supabase/migrations/20260928000500_seed_economy.sql')
    } else {
      logCoinError('grantDevCoins', error)
    }
    return fail('INTERNAL_ERROR', 'Could not add test coins')
  }
  return ok(typeof data === 'number' ? data : 0)
}

// The player's balance (their own users row, readable with their session). No row means the signup
// trigger never created the profile: ensure_user_profile() creates it with the 300 🪙 starter purse
// (migration 20260928000600) instead of silently reporting 0.
export async function readCoins(supabase: SupabaseClient<Database>, userId: string): Promise<ActionResult<number>> {
  const { data, error } = await supabase.from('users').select('coins').eq('id', userId).maybeSingle()
  if (error) {
    logCoinError('readCoins', error)
    return fail('INTERNAL_ERROR', 'Could not load your coins')
  }
  if (data) return ok(data.coins ?? 0)

  const healed = await supabase.rpc('ensure_user_profile')
  if (healed.error) {
    logCoinError('readCoins (ensure_user_profile)', healed.error)
    return ok(0)
  }
  return ok(typeof healed.data === 'number' ? healed.data : 0)
}
