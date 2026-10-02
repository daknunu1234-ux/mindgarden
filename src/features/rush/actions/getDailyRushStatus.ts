'use server'

import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { createClient } from '@/shared/lib/supabase/server'
import { ok, type ActionResult } from '@/shared/types/result'
import { loadRushStatus } from '../services/rush'
import type { RushStatus } from '../types'

// Auth: Optional. Whether the player already used today's Daily Rush (null when signed out). The
// farm greys every tree's ⚡ button with it; the rush page shows "See you tomorrow".
export async function getDailyRushStatus(): Promise<ActionResult<RushStatus | null>> {
  const supabase = await createClient()
  const user = await getRequestUser()
  if (!user) return ok(null)
  return ok(await loadRushStatus(supabase, user.id))
}
