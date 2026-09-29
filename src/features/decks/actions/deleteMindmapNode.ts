'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { DeleteMindmapNodeDto } from '../dto/ManageRootsDto'
import { removeMindmapNode } from '../services/authoring'

// Auth: Required (deck owner). Delete an empty root; NODE_NOT_EMPTY while it has statements or sub-roots.
export async function deleteMindmapNode(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = DeleteMindmapNodeDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  return removeMindmapNode(supabase, user.id, parsed.data)
}
