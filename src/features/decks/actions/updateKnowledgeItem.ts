'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { UpdateKnowledgeItemDto } from '../dto/ManageRootsDto'
import { editKnowledgeItem } from '../services/authoring'

export type EditedStatement = { id: string; statement: string; drillable: boolean }

// Auth: Required (deck owner). Changes a statement's text (cleaned, 5–500 characters of plain
// text). Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND,
// ITEM_NOT_FOUND (not in this tree), NODE_NOT_FOUND, INTERNAL_ERROR. No revalidatePath: the Tree Workshop
// edits optimistically (deck draft), and EditStatementDialog refreshes the page itself.
export async function updateKnowledgeItem(input: unknown): Promise<ActionResult<EditedStatement>> {
  const parsed = UpdateKnowledgeItemDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  const res = await editKnowledgeItem(supabase, user.id, parsed.data)
  if (!res.success) return res
  return ok({ id: res.data.id, statement: res.data.statement, drillable: res.data.drillable })
}
