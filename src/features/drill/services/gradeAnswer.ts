import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { findDrillItem } from '@/features/decks/server'
import { generateTraps } from '@/shared/lib/trapEngine'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { CheckDrillAnswerInput } from '../dto/CheckDrillAnswerDto'
import type { DrillAnswer } from '../types'

// Re-runs the engine with the question's seed to find the correct tag. Saves nothing.
export async function gradeAnswer(
  supabase: SupabaseClient<Database>,
  { itemId, seed, tag }: CheckDrillAnswerInput,
): Promise<ActionResult<DrillAnswer>> {
  const res = await findDrillItem(supabase, itemId)
  if (!res.success) return res

  const traps = generateTraps(res.data.correctStmt, res.data.trapRules, seed)
  if (!traps.ok) return fail('ITEM_NOT_FOUND', 'This item can no longer be drilled')

  return ok({ isCorrect: tag === traps.correctTag, correctTag: traps.correctTag })
}
