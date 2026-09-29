'use server'

import { fetchTournamentLevels, findStanding } from '@/features/tournament/server'
import { createClient } from '@/shared/lib/supabase/server'
import { fail, type ActionResult } from '@/shared/types/result'
import { GetTournamentSessionDto } from '../dto/GetDrillSessionDto'
import { buildTournamentSession, type LoadLevels } from '../services/drillSession'
import type { DrillSession } from '../types'

const GRADUATED_MESSAGE = 'You already mastered this tree: your name is in the Hall of Fame'

// Auth: Required, and never the host. A Mind Tournament round on someone else's public tree while
// its owner hosts a tournament: the whole tree or one root (rootId), the contestant's TOURNAMENT levels decide which
// statements rest (5/5), and answers go to submitTournamentAnswer (never user_progress).
// Errors: VALIDATION_FAILED, AUTH_UNAUTHORIZED, AUTH_FORBIDDEN (host), TOURNAMENT_CLOSED,
// TOURNAMENT_GRADUATED, DECK_NOT_FOUND, NODE_NOT_FOUND (rootId not in this tree), DRILL_NO_ITEMS, DRILL_ALL_MASTERED, INTERNAL_ERROR.
export async function getTournamentSession(input: unknown): Promise<ActionResult<DrillSession>> {
  const parsed = GetTournamentSessionDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('AUTH_UNAUTHORIZED', 'Sign in to compete in the Mind Tournament')

  // Called after the tournament guard passed. A graduate's run is frozen, so there is no round.
  let graduated = false
  const loadLevels: LoadLevels = async (_itemIds, deckId) => {
    const [levels, standing] = await Promise.all([fetchTournamentLevels(supabase, user.id, deckId), findStanding(supabase, user.id, deckId)])
    graduated = standing.success && standing.data?.isGraduated === true
    // Levels that can't be read just mean nothing rests: never block the round on them.
    return levels.success ? levels.data : new Map()
  }

  const session = await buildTournamentSession(
    supabase,
    { slug: parsed.data.slug, nodeId: parsed.data.rootId, limit: parsed.data.limit },
    crypto.randomUUID(),
    { viewerId: user.id, loadLevels },
  )
  if (graduated) return fail('TOURNAMENT_GRADUATED', GRADUATED_MESSAGE)
  return session
}
