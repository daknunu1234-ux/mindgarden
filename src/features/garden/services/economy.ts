import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { FarmEconomyView } from '../lib/farmEconomy'

type Client = SupabaseClient<Database>
const MISSING = new Set(['42P01', 'PGRST205', 'PGRST202', '42883'])

// Brings the signed-in gardener's island up to date (settle_farm_economy(): production since the last
// visit and, with a powered Seaport, the cargo ship's payout), on the server.
export async function settleEconomy(supabase: Client): Promise<ActionResult<FarmEconomyView>> {
  const { data, error } = await supabase.rpc('settle_farm_economy')
  if (error) {
    if (MISSING.has(error.code)) console.error('[garden] settleEconomy: run supabase/migrations/20261014000000_power_grid.sql')
    else if (!(error.message ?? '').includes('AUTH_UNAUTHORIZED')) console.error('[garden] settleEconomy failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not update the island')
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return fail('INTERNAL_ERROR', 'Could not update the island')
  return ok({
    timber: Number(row.timber),
    produce: Number(row.produce),
    furniture: Number(row.furniture),
    fruit: Number(row.fruit ?? 0),
    candy: Number(row.candy ?? 0),
    candyShipped: row.candy_shipped ?? 0,
    candyPayout: row.candy_payout ?? 0,
    payout: row.payout,
    totalCoins: row.total_coins,
    lastExportAt: row.last_export_at,
  })
}

export type FarmInventory = { fruit: number; candy: number }

// The gardener's fruit and candy boxes as stored (no settlement): the header's 🍎 counter. Null when
// the row can't be read (no row yet means 0 of each).
export async function readInventory(supabase: Client, userId: string): Promise<FarmInventory | null> {
  const { data, error } = await supabase.from('farm_economy').select('fruit, candy').eq('user_id', userId).maybeSingle()
  if (error) {
    if (MISSING.has(error.code) || error.code === '42703') console.error('[garden] readInventory: run supabase/migrations/20261015000000_rail_logistics.sql')
    else console.error('[garden] readInventory failed', error.code, error.message)
    return null
  }
  return { fruit: Math.floor(Number(data?.fruit ?? 0)), candy: Math.floor(Number(data?.candy ?? 0)) }
}
