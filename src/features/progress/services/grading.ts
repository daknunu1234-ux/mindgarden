import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { findDrillItem } from '@/features/decks/server'
import { buildQuestion, prepareDeck, toDeckNote } from '@/shared/lib/questionEngine'
import { canPractice, VISITOR_PRACTICE_MESSAGE } from '@/shared/lib/visitor'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { DrillSubmission } from '../dto/DrillSubmissionDto'
import type { GradedAnswer } from '../types'

// Re-builds the question from its seed and the whole deck (exactly what the session used); the client
// never decides correctness.
// Shared with drill's checkDrillAnswer through progress/server. Only the deck's owner may be graded:
// visitors are read-only (FORBIDDEN_VISITOR_PRACTICE), so progress and mastery coins can't be
// earned on someone else's tree.
export async function gradeSubmission(
  supabase: SupabaseClient<Database>,
  submission: DrillSubmission,
  viewerId: string | null,
): Promise<ActionResult<GradedAnswer>> {
  const graded = await gradeWithTree(supabase, submission, viewerId)
  return graded.success ? ok(graded.data.answer) : graded
}

// The same grading, plus the item's tree (recordDrillResult logs the tree's practice day with it).
export async function gradeWithTree(
  supabase: SupabaseClient<Database>,
  { itemId, seed, tag }: DrillSubmission,
  viewerId: string | null,
): Promise<ActionResult<{ answer: GradedAnswer; deckId: string }>> {
  const item = await findDrillItem(supabase, itemId)
  if (!item.success) return item
  if (!canPractice(item.data.ownerId, viewerId)) return fail('FORBIDDEN_VISITOR_PRACTICE', VISITOR_PRACTICE_MESSAGE)

  // Same deck context as the session that showed the question, so the correct tag matches.
  const built = buildQuestion(prepareDeck(item.data.deckItems.map(toDeckNote)), item.data.id, seed)
  if (!built.ok) return fail('ITEM_NOT_FOUND', 'This item can no longer be drilled')

  return ok({ answer: { isCorrect: tag === built.question.correctTag, correctTag: built.question.correctTag }, deckId: item.data.deckId })
}
