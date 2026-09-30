'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { RemoveFarmPlacementDto } from '../dto/FarmDto'
import { removePlacement } from '../services/placements'

// Auth: Required. Picks one of your farm items up again (no refund). A tree goes back to the Shop's
// Trees tab, unchanged: only chopping (deleting) a tree pays the Woodshop refund.
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, INTERNAL_ERROR.
export async function removeFarmPlacement(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = RemoveFarmPlacementDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to build your farm')

  const res = await removePlacement(supabase, user.id, parsed.data)
  if (res.success) revalidatePath('/')
  return res
}
