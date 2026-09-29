'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { DeleteKnowledgeItemDto } from '../dto/ManageRootsDto'
import { removeKnowledgeItem } from '../services/authoring'

// Auth: Required (deck owner). Remove a statement; players' progress on it goes with it (cascade).
export async function deleteKnowledgeItem(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = DeleteKnowledgeItemDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  return removeKnowledgeItem(supabase, user.id, parsed.data)
}
