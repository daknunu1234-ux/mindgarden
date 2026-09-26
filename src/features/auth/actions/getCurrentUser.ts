'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { ok, type ActionResult } from '@/shared/types/result'
import { readSessionUser } from '../services/session'
import type { SessionUser } from '../types'

// Auth: Optional. The verified user (via getUser), or null when signed out.
export async function getCurrentUser(): Promise<ActionResult<SessionUser | null>> {
  const supabase = await createClient()
  return ok(await readSessionUser(supabase))
}
