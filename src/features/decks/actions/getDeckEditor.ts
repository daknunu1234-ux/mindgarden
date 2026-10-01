'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { getRequestUser } from '@/shared/lib/supabase/requestUser'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetDeckEditorDto } from '../dto/GetDeckEditorDto'
import { loadDeckEditor } from '../services/authoring'
import type { DeckEditor } from '../types'

// Auth: Required (deck owner). Roots with their true statements for the editor.
export async function getDeckEditor(input: unknown): Promise<ActionResult<DeckEditor>> {
  const parsed = GetDeckEditorDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  // One verified Auth call per request, shared with the other actions on the page.
  const user = await getRequestUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  return loadDeckEditor(supabase, user.id, parsed.data.deckId)
}
