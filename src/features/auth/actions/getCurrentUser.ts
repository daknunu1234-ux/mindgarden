'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { ok, type ActionResult } from '@/shared/types/result'
import { readSessionUser } from '../services/session'
import type { SessionUser } from '../types'

// Auth: Optional. The verified user (via getUser), or null when signed out.
export async function getCurrentUser(): Promise<ActionResult<SessionUser | null>> {
  // The verified user is shared with every other action in this request (one Auth round trip).
  const [supabase, user] = await Promise.all([createClient(), getRequestUser()])
  return ok(await readSessionUser(supabase, user))
}
