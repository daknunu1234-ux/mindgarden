'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { getRequestUser } from '@/shared/lib/supabase/requestUser'
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
  // One verified Auth call per request, shared with the other actions on the page.
  const user = await getRequestUser()
  return loadDeckReader(supabase, user?.id ?? null, parsed.data.deckId)
}
