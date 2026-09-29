'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { UpdateDisplayNameDto } from '../dto/DisplayNameDto'
import { saveDisplayName } from '../services/profile'

// Auth: Required. Sets the signed-in player's own public "Garden Name" (2–30 characters after
// sanitizing). Revalidates every page (header, boards, Visited Gardens, profile) so the new name
// shows on the next render. Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, INTERNAL_ERROR.
export async function updateDisplayName(input: unknown): Promise<ActionResult<{ displayName: string }>> {
  const parsed = UpdateDisplayNameDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to choose your garden name')

  const res = await saveDisplayName(supabase, user.id, parsed.data.displayName)
  if (res.success) revalidatePath('/', 'layout')
  return res
}
