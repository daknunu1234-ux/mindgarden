'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { MoveFarmPlacementDto } from '../dto/FarmDto'
import { movePlacement, type MovedPlacement } from '../services/placements'

// Auth: Required. Moves one of your farm trees or items to a new top tile (same footprint, no coins
// either way). The database checks ownership, bounds and overlaps (move_garden_placement). Buffs and
// stream / fence auto-tiling follow from the new tiles.
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (not yours), TILE_UNAVAILABLE, INTERNAL_ERROR.
export async function moveFarmPlacement(input: unknown): Promise<ActionResult<MovedPlacement>> {
  const parsed = MoveFarmPlacementDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to build your farm')

  // No revalidatePath: in a Server Action it re-renders the whole farm page before answering
  // (seconds). The farm already shows the change (optimistic, lib/optimistic.ts), and the page is
  // dynamic (router cache 0 s), so the next visit loads fresh data anyway.
  return movePlacement(supabase, parsed.data)
}
