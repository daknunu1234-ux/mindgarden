'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import type { GardenStats } from '../lib/gardenStats'
import { loadGardenStats } from '../services/gardenStats'

// Auth: Required. Totals for the signed-in gardener's own trees (no input).
export async function getGardenStats(): Promise<ActionResult<GardenStats>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to see your garden')

  return loadGardenStats(supabase, user.id)
}
