'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { ok, type ActionResult } from '@/shared/types/result'
import { loadFarmHud } from '../services/farmHud'
import type { FarmHud } from '../types'

// Auth: Optional. Gardener level + streak for the farm HUD; null when signed out.
export async function getFarmHud(): Promise<ActionResult<FarmHud | null>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ok(null)
  return loadFarmHud(supabase, user.id)
}
