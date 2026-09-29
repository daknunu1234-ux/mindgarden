'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetDeckEditorDto } from '../dto/GetDeckEditorDto'
import { loadDeckReader } from '../services/authoring'
import type { DeckEditor } from '../types'

// Auth: Optional. Read-only roots + true statements of a PUBLIC tree (or your own), for visitors
// exploring someone else's shared tree. Reading is all they can do: drilling it is owner-only
// (FORBIDDEN_VISITOR_PRACTICE), so they clone it to practise. Private trees → DECK_NOT_FOUND.
export async function getDeckReader(input: unknown): Promise<ActionResult<DeckEditor>> {
  const parsed = GetDeckEditorDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return loadDeckReader(supabase, user?.id ?? null, parsed.data.deckId)
}
