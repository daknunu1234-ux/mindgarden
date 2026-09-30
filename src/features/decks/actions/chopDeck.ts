'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { DeleteDeckDto } from '../dto/DeleteDeckDto'
import { removeDeck } from '../services/authoring'

export type ChoppedDeck = { id: string; refund: number; totalCoins: number | null }

// Auth: Required (deck owner). Uproots (chops) a whole tree: roots, statements, players' progress and
// the farm tile cascade away, and a Woodshop refunds 25% of the statements (at most 50). It answers
// with the result and never revalidates or redirects: in a Server Action either one makes the server
// re-render whole pages before answering (seconds). Both callers show the result themselves: the farm's
// 🪓 Chop has already removed the tree optimistically, and the deck page's Danger Zone replaces the
// route with the farm on the client. `totalCoins` is the purse after the refund (null when the
// farm-grid migration hasn't run: no refund then).
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND, INTERNAL_ERROR.
export async function chopDeck(input: unknown): Promise<ActionResult<ChoppedDeck>> {
  const parsed = DeleteDeckDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to uproot your tree')

  const res = await removeDeck(supabase, user.id, parsed.data)
  if (!res.success) return res
  return ok({ id: res.data.id, refund: res.data.refund, totalCoins: res.data.totalCoins })
}
