'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { UpdateMindmapNodeDto } from '../dto/ManageRootsDto'
import { renameMindmapNode } from '../services/authoring'

// Auth: Required (deck owner). Rename a root.
export async function updateMindmapNode(input: unknown): Promise<ActionResult<{ id: string; title: string }>> {
  const parsed = UpdateMindmapNodeDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  return renameMindmapNode(supabase, user.id, parsed.data)
}
