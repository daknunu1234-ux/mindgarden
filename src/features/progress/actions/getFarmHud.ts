'use server'

import { cache } from 'react'
import { createClient } from '@/shared/lib/supabase/server'
import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { ok, type ActionResult } from '@/shared/types/result'
import { loadFarmHud } from '../services/farmHud'
import type { FarmHud } from '../types'

// One load per request: the root layout (header stats) and the page (farm, deck) both ask for it.
const loadHudOnce = cache(async (): Promise<ActionResult<FarmHud | null>> => {
  const supabase = await createClient()
  // One verified Auth call per request, shared with the other actions on the page.
  const user = await getRequestUser()
  if (!user) return ok(null)
  return loadFarmHud(supabase, user.id)
})

// Auth: Optional. Streak + 🪙 for the header and the farm; null when signed out. Read-only.
export async function getFarmHud(): Promise<ActionResult<FarmHud | null>> {
  return loadHudOnce()
}
