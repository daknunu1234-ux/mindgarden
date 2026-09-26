'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { CreateMindmapNodeDto } from '../dto/CreateMindmapNodeDto'
import { insertMindmapNode } from '../services/authoring'

// Auth: Required (deck owner). Adds a root at the top level or under parentId.
export async function createMindmapNode(input: unknown): Promise<ActionResult<{ id: string; title: string }>> {
  const parsed = CreateMindmapNodeDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  return insertMindmapNode(supabase, user.id, parsed.data)
}
