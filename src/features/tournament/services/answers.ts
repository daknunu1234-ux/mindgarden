import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listDrillItems } from '@/features/decks/server'
import { localDay, resolveTimeZone } from '@/shared/lib/localDay'
import { toMasteryLevel } from '@/shared/lib/mastery'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import { buildQuestion, prepareDeck, questionKinds, toDeckNote } from '@/shared/lib/questionEngine'
import { tournamentAccess } from '@/shared/lib/visitor'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { SubmitTournamentAnswerInput } from '../dto/TournamentDto'
import type { TournamentAnswer } from '../types'

// Grades one tournament pick and saves it to the contestant's ISOLATED tournament progress.
//  1. The player's client (RLS) loads the tree; it must be public, hosting, and not theirs.
//  2. The question engine rebuilds the question from its seed and the whole tree (exactly as the
//     round built it), so the client never decides correctness.
//  3. record_tournament_answer() (service role: players have no write grants on the tournament
//     tables) moves the item's tournament level ±1, counts a new local calendar day once,
//     recomputes points over the tree's current drillable statements and graduates at 100%.
// user_progress, practice_days (streaks) and coins are never written here.
export async function recordTournamentAnswer(
  supabase: SupabaseClient<Database>,
  userId: string,
  { deckId, itemId, seed, tag, timeZone }: SubmitTournamentAnswerInput,
  now: Date = new Date(),
): Promise<ActionResult<TournamentAnswer>> {
  const tree = await listDrillItems(supabase, { deckId })
  if (!tree.success) return tree

  const access = tournamentAccess(tree.data.deck, userId)
  if (access === 'closed') return fail('TOURNAMENT_CLOSED', 'This tree is not hosting a Mind Tournament right now')
  if (access === 'host') return fail('AUTH_FORBIDDEN', 'You host this tournament: practise your own tree instead')

  // Drillable = the engine can ask it at all (seed-independent); nearly every note now.
  const deck = prepareDeck(tree.data.items.map(toDeckNote))
  const drillable = tree.data.items.filter((i) => questionKinds(deck, i.id).length > 0)
  const item = drillable.find((i) => i.id === itemId)
  if (!item) return fail('ITEM_NOT_FOUND', 'This statement is not part of the tournament')

  const built = buildQuestion(deck, item.id, seed)
  if (!built.ok) return fail('ITEM_NOT_FOUND', 'This statement can no longer be drilled')
  const isCorrect = tag === built.question.correctTag

  const admin = createAdminClient()
  if (!admin) {
    console.error('[tournament] recordTournamentAnswer: SUPABASE_SERVICE_ROLE_KEY is not set')
    return fail('INTERNAL_ERROR', 'Could not save this tournament answer')
  }
  const { data, error } = await admin.rpc('record_tournament_answer', {
    p_user_id: userId,
    p_deck_id: deckId,
    p_item_id: itemId,
    p_is_correct: isCorrect,
    p_day: localDay(now, resolveTimeZone(timeZone)),
    p_drillable_item_ids: drillable.map((i) => i.id),
  })

  if (error) {
    const message = error.message ?? ''
    if (message.includes('TOURNAMENT_GRADUATED')) {
      return fail('TOURNAMENT_GRADUATED', 'You already mastered this tree: your name is in the Hall of Fame')
    }
    if (message.includes('TOURNAMENT_CLOSED')) return fail('TOURNAMENT_CLOSED', 'This tree is not hosting a Mind Tournament right now')
    if (message.includes('TOURNAMENT_HOST')) return fail('AUTH_FORBIDDEN', 'You host this tournament: practise your own tree instead')
    if (message.includes('ITEM_NOT_FOUND')) return fail('ITEM_NOT_FOUND', 'This statement is not part of the tournament')
    // PGRST202 / 42883: run 20260928000900_mind_tournament.sql.
    // 23503: the contestant has no public.users row yet.
    console.error('[tournament] record_tournament_answer failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not save this tournament answer')
  }

  const row = Array.isArray(data) ? data[0] : data
  if (!row) {
    console.error('[tournament] record_tournament_answer returned no row')
    return fail('INTERNAL_ERROR', 'Could not save this tournament answer')
  }
  return ok({
    isCorrect,
    correctTag: built.question.correctTag,
    masteryLevel: toMasteryLevel(row.mastery_level),
    previousMasteryLevel: toMasteryLevel(row.previous_level),
    currentPoints: row.current_points,
    maxPoints: row.max_points,
    masteryPercentage: row.mastery_percentage === null ? null : Number(row.mastery_percentage),
    daysCount: row.days_count,
    isGraduated: row.is_graduated,
    justGraduated: row.just_graduated,
  })
}
