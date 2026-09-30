'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { PlaceFarmItemDto } from '../dto/FarmDto'
import { placeItem, type PlacedItem } from '../services/placements'

// Auth: Required. Plants one of your trees (free) or buys a shop item and puts it on your farm at
// (x, y), its top tile. The database charges the catalogue price and checks the spot atomically.
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, INSUFFICIENT_COINS, TILE_UNAVAILABLE, DECK_NOT_FOUND, INTERNAL_ERROR.
export async function placeFarmItem(input: unknown): Promise<ActionResult<PlacedItem>> {
  const parsed = PlaceFarmItemDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to build your farm')

  // No revalidatePath: in a Server Action it re-renders the whole farm page before answering
  // (seconds). The farm already shows the change (optimistic, lib/optimistic.ts), and the page is
  // dynamic (router cache 0 s), so the next visit loads fresh data anyway.
  return placeItem(supabase, parsed.data)
}
