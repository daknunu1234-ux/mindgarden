'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { DeleteRootBranchDto } from '../dto/ManageRootsDto'
import { removeRootBranch } from '../services/authoring'

export type DeletedBranch = { rootId: string; deletedStatements: number; deletedSubRoots: number }

// Auth: Required (deck owner). Deletes a root with its sub-roots, every statement in them and
// everyone's progress on those statements (user_progress, Mind Tournament item progress), by
// database cascade. Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN, DECK_NOT_FOUND,
// NODE_NOT_FOUND (not in this tree), INTERNAL_ERROR.
export async function deleteRootBranch(input: unknown): Promise<ActionResult<DeletedBranch>> {
  const parsed = DeleteRootBranchDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to edit your tree')

  const res = await removeRootBranch(supabase, user.id, parsed.data)
  if (!res.success) return res
  // Mindmap, Tree Workshop list, counts and the launch pop-up's available questions.
  revalidatePath(`/deck/${res.data.slug}`)
  return ok({ rootId: res.data.rootId, deletedStatements: res.data.deletedStatements, deletedSubRoots: res.data.deletedSubRoots })
}
