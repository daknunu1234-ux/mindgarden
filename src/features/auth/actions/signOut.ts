'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'

// Auth: Optional. Clears the session cookies; the caller refreshes the page afterwards.
export async function signOut(): Promise<ActionResult<null>> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signOut()
  if (error) {
    console.error('[auth] signOut failed', error.status, error.code)
    return fail('INTERNAL_ERROR', 'Could not sign out')
  }
  return ok(null)
}
