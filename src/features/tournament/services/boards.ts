import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { contestantName } from '../lib/scoring'
import type { TournamentBoards, TournamentStanding } from '../types'

const MISSING_FUNCTION = new Set(['PGRST202', '42883'])

// Both boards of a tree. The board functions check the tree is readable (public, or the caller's
// own) and return a profile name but never an email; names fall back to the friendly pseudonym.
// Before migration 20260928000900 they don't exist: empty boards, and the log names the migration.
export async function loadBoards(supabase: SupabaseClient<Database>, deckId: string): Promise<ActionResult<TournamentBoards>> {
  const [active, fame] = await Promise.all([
    supabase.rpc('get_tournament_active_board', { p_deck_id: deckId }),
    supabase.rpc('get_tournament_hall_of_fame', { p_deck_id: deckId }),
  ])
  const error = active.error ?? fame.error
  if (error) {
    if (MISSING_FUNCTION.has(error.code)) {
      console.error('[tournament] loadBoards: run supabase/migrations/20260928000900_mind_tournament.sql')
      return ok({ active: [], hallOfFame: [] })
    }
    console.error('[tournament] loadBoards failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load the tournament boards')
  }

  return ok({
    active: (active.data ?? []).map((r) => ({
      rank: Number(r.rank),
      userId: r.user_id,
      name: contestantName(r.display_name, r.user_id),
      currentPoints: r.current_points,
      maxPoints: r.max_points,
      masteryPercentage: r.mastery_percentage === null ? null : Number(r.mastery_percentage),
      daysCount: r.days_count,
      updatedAt: r.updated_at,
    })),
    hallOfFame: (fame.data ?? []).map((r) => ({
      rank: Number(r.rank),
      userId: r.user_id,
      name: contestantName(r.display_name, r.user_id),
      maxPoints: r.max_points,
      daysCount: r.days_count,
      graduatedAt: r.graduated_at,
    })),
  })
}

// The viewer's own row on a tree, read with their session (RLS: own rows only).
export async function findStanding(
  supabase: SupabaseClient<Database>,
  userId: string,
  deckId: string,
): Promise<ActionResult<TournamentStanding | null>> {
  const { data, error } = await supabase
    .from('deck_tournament_participants')
    .select('current_points, max_points, mastery_percentage, days_count, is_graduated, graduated_at')
    .eq('deck_id', deckId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) {
    console.error('[tournament] findStanding failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load your tournament progress')
  }
  if (!data) return ok(null)
  return ok({
    currentPoints: data.current_points,
    maxPoints: data.max_points,
    masteryPercentage: data.mastery_percentage === null ? null : Number(data.mastery_percentage),
    daysCount: data.days_count,
    isGraduated: data.is_graduated,
    graduatedAt: data.graduated_at,
  })
}
