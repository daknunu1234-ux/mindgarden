'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { GetVisitedGardensDto } from '../dto/TreeVisitDto'
import { listVisitedTrees } from '../services/visits'
import type { VisitedTree } from '../types'

// Auth: Optional. The shared trees the signed-in player has opened, newest visit first (the farm's
// Visited Gardens drawer). Signed out → [].
export async function getVisitedGardens(input: unknown = {}): Promise<ActionResult<VisitedTree[]>> {
  const parsed = GetVisitedGardensDto.safeParse(input ?? {})
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return ok([])

  return listVisitedTrees(supabase, user.id, parsed.data)
}
