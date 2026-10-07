'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { RenameDeckDto } from '../dto/RenameDeckDto'
import { updateDeckSettings } from '../services/authoring'

export type RenamedDeck = { id: string; title: string }

// Auth: Required (the tree's owner). Renames a tree: the name is cleaned and must be 1–100
// characters (shared/lib/treeName). The slug stays. No revalidatePath: the farm and the deck page
// show the new name at once (optimistic) and roll back if this fails.
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND, INTERNAL_ERROR.
export async function renameDeck(input: unknown): Promise<ActionResult<RenamedDeck>> {
  const parsed = RenameDeckDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to rename your tree')

  const res = await updateDeckSettings(supabase, user.id, { deckId: parsed.data.deckId, title: parsed.data.title, description: undefined })
  return res.success ? ok({ id: res.data.id, title: res.data.title }) : res
}
