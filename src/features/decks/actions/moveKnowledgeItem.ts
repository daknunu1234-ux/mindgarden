'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { MoveKnowledgeItemDto } from '../dto/ManageRootsDto'
import { moveKnowledgeItem as moveItem } from '../services/content'

export type MovedStatementResult = { id: string; nodeId: string; subStatements: number }

// Auth: Required (deck owner). Moves a statement, with its sub-statements, to another root or
// sub-root of the same tree (appended last; a sub-statement becomes a statement there). Mastery and
// coins already paid are kept. Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN,
// DECK_NOT_FOUND, ITEM_NOT_FOUND, NODE_NOT_FOUND (target not in this tree), INTERNAL_ERROR.
// No revalidatePath: the page moves it optimistically (deck draft).
export async function moveKnowledgeItem(input: unknown): Promise<ActionResult<MovedStatementResult>> {
  const parsed = MoveKnowledgeItemDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  const res = await moveItem(supabase, user.id, parsed.data)
  if (!res.success) return res
  return ok({ id: res.data.id, nodeId: res.data.nodeId, subStatements: res.data.subStatements })
}
