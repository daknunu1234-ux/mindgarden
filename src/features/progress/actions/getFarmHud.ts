'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { ok, type ActionResult } from '@/shared/types/result'
import { loadFarmHud } from '../services/farmHud'
import type { FarmHud } from '../types'

// Auth: Optional. Gardener level + streak for the farm HUD; null when signed out.
export async function getFarmHud(): Promise<ActionResult<FarmHud | null>> {
  const supabase = await createClient()
  // One verified Auth call per request, shared with the other actions on the page.
  const user = await getRequestUser()
  if (!user) return ok(null)
  return loadFarmHud(supabase, user.id)
}
