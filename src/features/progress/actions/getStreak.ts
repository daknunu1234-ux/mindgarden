'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { ok, type ActionResult } from '@/shared/types/result'
import type { Streaks } from '../lib/streak'
import { loadStreaks } from '../services/streak'

// Auth: Optional. The signed-in player's streaks (for the header badge), null when signed out
// or when the streak can't be read (the header simply shows no badge).
export async function getStreak(): Promise<ActionResult<Streaks | null>> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ok(null)

  const streaks = await loadStreaks(supabase, user.id)
  return ok(streaks.success ? streaks.data : null)
}
