'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { ok, type ActionResult } from '@/shared/types/result'
import { readInventory, type FarmInventory } from '../services/economy'

// Auth: Optional. The signed-in gardener's island inventory for the header (🍎 fruit, 🍬 candy boxes),
// with the time it was read; null when signed out. Read only (RLS: own row). Never fails the page: on
// a read error (or before migration 20261015000000) it answers null.
export async function getFarmInventory(): Promise<ActionResult<(FarmInventory & { asOf: number }) | null>> {
  const user = await getRequestUser()
  if (!user) return ok(null)
  const res = await readInventory(await createClient(), user.id)
  return ok(res ? { ...res, asOf: Date.now() } : null)
}
