'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { CreateKnowledgeItemDto } from '../dto/CreateKnowledgeItemDto'
import { insertKnowledgeItem } from '../services/authoring'

// Auth: Required (deck owner). The author writes only the true statement; trap_rules
// defaults to { negate: true } and the prompt to the root's title.
export async function createKnowledgeItem(
  input: unknown,
): Promise<ActionResult<{ id: string; drillable: boolean }>> {
  const parsed = CreateKnowledgeItemDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  return insertKnowledgeItem(supabase, user.id, parsed.data)
}
