import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'

// The contestant's TOURNAMENT mastery per item on one tree (never user_progress), read with their
// session (RLS: own rows only). Drill uses it to rest 5/5 items in a tournament round.
export async function fetchTournamentLevels(
  supabase: SupabaseClient<Database>,
  userId: string,
  deckId: string,
): Promise<ActionResult<ReadonlyMap<string, number>>> {
  const { data: participant, error } = await supabase
    .from('deck_tournament_participants')
    .select('id')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[tournament] fetchTournamentLevels failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load your tournament progress')
  }
  if (!participant) return ok(new Map())

  const { data: rows, error: levelsError } = await supabase
    .from('deck_tournament_item_progress')
    .select('knowledge_item_id, mastery_level')
    .eq('participant_id', participant.id)
  if (levelsError) {
    console.error('[tournament] fetchTournamentLevels failed', levelsError.code, levelsError.message)
    return fail('INTERNAL_ERROR', 'Could not load your tournament progress')
  }
  return ok(new Map(rows.map((r) => [r.knowledge_item_id, r.mastery_level])))
}
