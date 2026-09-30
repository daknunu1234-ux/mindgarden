'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { DeleteKnowledgeItemDto } from '../dto/ManageRootsDto'
import { removeKnowledgeItem } from '../services/authoring'

// Auth: Required (deck owner). Deletes one statement of `deckId`; everyone's progress on it
// (user_progress, Mind Tournament item progress) goes with it by database cascade.
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, ITEM_NOT_FOUND, NODE_NOT_FOUND, INTERNAL_ERROR.
export async function deleteKnowledgeItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = DeleteKnowledgeItemDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  const res = await removeKnowledgeItem(supabase, user.id, parsed.data)
  if (!res.success) return res
  // No revalidatePath: in a Server Action it re-renders the whole deck page before answering. The page
  // has already removed the statement (deck draft) and puts it back if this fails.
  return ok({ id: res.data.id })
}
