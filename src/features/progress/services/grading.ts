import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { findDrillItem } from '@/features/decks/server'
import { generateTraps } from '@/shared/lib/trapEngine'
import { canPractice, VISITOR_PRACTICE_MESSAGE } from '@/shared/lib/visitor'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { DrillSubmission } from '../dto/DrillSubmissionDto'
import type { GradedAnswer } from '../types'

// Re-runs the engine with the question's seed and node siblings; the client never decides correctness.
// Shared with drill's checkDrillAnswer through progress/server. Only the deck's owner may be graded:
// visitors are read-only (FORBIDDEN_VISITOR_PRACTICE), so progress and mastery coins can't be
// earned on someone else's tree.
export async function gradeSubmission(
  supabase: SupabaseClient<Database>,
  { itemId, seed, tag }: DrillSubmission,
  viewerId: string | null,
): Promise<ActionResult<GradedAnswer>> {
  const item = await findDrillItem(supabase, itemId)
  if (!item.success) return item
  if (!canPractice(item.data.ownerId, viewerId)) return fail('FORBIDDEN_VISITOR_PRACTICE', VISITOR_PRACTICE_MESSAGE)

  // Same siblings as the session that showed the question, so the correct tag matches.
  const traps = generateTraps(item.data.correctStmt, item.data.trapRules, seed, item.data.siblingStatements)
  if (!traps.ok) return fail('ITEM_NOT_FOUND', 'This item can no longer be drilled')

  return ok({ isCorrect: tag === traps.correctTag, correctTag: traps.correctTag })
}
