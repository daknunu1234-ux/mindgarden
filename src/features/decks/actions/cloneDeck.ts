'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { CloneDeckDto } from '../dto/CloneDeckDto'
import { cloneSharedDeck, type ClonedDeck } from '../services/authoring'

// Auth: Required. Copies another gardener's PUBLIC tree (roots + statements, no progress) into
// the caller's garden for min(100 + statements, 150) 🪙 (cloneCost). INSUFFICIENT_COINS when the
// purse is short, CANNOT_CLONE_OWN_DECK for your own tree. The copy is private and practisable
// from 0/5. Returns the new deck, the purse after paying and the fee charged.
export async function cloneDeck(input: unknown): Promise<ActionResult<ClonedDeck>> {
  const parsed = CloneDeckDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to clone this tree')

  const res = await cloneSharedDeck(supabase, parsed.data)
  if (res.success) {
    // Farm (new plot + HUD purse) and profile (orchard, purse). The page navigates to the copy.
    revalidatePath('/')
    revalidatePath('/profile')
  }
  return res
}
