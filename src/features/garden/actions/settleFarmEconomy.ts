'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import type { FarmEconomyView } from '../lib/farmEconomy'
import { settleEconomy } from '../services/economy'

// Auth: Required. Brings your island up to date and returns its stock: timber from your trees,
// produce from your animals, furniture from powered factories, and, every 4 hours with a powered
// Seaport, a cargo ship's payout (credited to your purse). All computed in the database from
// timestamps (settle_farm_economy, migration 20261014000000); nothing is sent but the call.
// No revalidatePath: the farm shows the result itself.
// Errors: AUTH_UNAUTHORIZED, INTERNAL_ERROR.
export async function settleFarmEconomy(): Promise<ActionResult<FarmEconomyView>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to run your island')
  return settleEconomy(supabase)
}
