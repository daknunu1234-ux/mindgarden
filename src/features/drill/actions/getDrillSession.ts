'use server'

import { fetchMasteryLevels } from '@/features/progress/server'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetDrillSessionDto } from '../dto/GetDrillSessionDto'
import { buildDrillSession, type LoadLevels } from '../services/drillSession'
import type { DrillSession } from '../types'

// Auth: Optional. Input: { slug } or { deckId }, plus optional nodeId, limit (1–50, default 20)
// and includeMastered (default false). Signed-in players' 5/5 items sit out unless includeMastered;
// signed-out players have no progress, so nothing is excluded.
export async function getDrillSession(input: unknown): Promise<ActionResult<DrillSession>> {
  const parsed = GetDrillSessionDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Progress that can't be read just means nothing is filtered out: never block practice on it.
  const loadLevels: LoadLevels | undefined = user
    ? async (itemIds) => {
        const loaded = await fetchMasteryLevels(supabase, user.id, itemIds)
        return loaded.success ? loaded.data : new Map()
      }
    : undefined

  return buildDrillSession(supabase, parsed.data, crypto.randomUUID(), loadLevels)
}
