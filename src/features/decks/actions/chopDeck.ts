'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { DeleteDeckDto } from '../dto/DeleteDeckDto'
import { removeDeck } from '../services/authoring'

export type ChoppedDeck = { id: string; refund: number; totalCoins: number | null }

// Auth: Required (deck owner). The farm's 🪓 Chop: the same uproot as deleteDeck (roots, statements,
// players' progress and the farm tile cascade away; a Woodshop refunds 25% of the statements, at most
// 50), but it answers with the result instead of redirecting and never revalidates the home page:
// the farm has already removed the tree and credited the refund optimistically, so a server re-render
// of `/` (seconds) would only slow it down. `totalCoins` is the purse after the refund (null when the
// farm-grid migration hasn't run: no refund then). deleteDeck stays for the deck page's Danger Zone,
// which must leave the page it deletes.
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
