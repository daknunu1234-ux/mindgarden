'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { GetTournamentBoardsDto } from '../dto/TournamentDto'
import { standingRank } from '../lib/scoring'
import { findStanding, loadBoards } from '../services/boards'
import { fetchTournamentLevels } from '../services/levels'
import type { TournamentBoards, TournamentStanding } from '../types'

export type TournamentBoardsView = TournamentBoards & {
  standing: TournamentStanding | null
  // The viewer's tournament level per statement (item id → 0–5); {} when signed out or not joined.
  levels: Record<string, number>
}

// Auth: Optional. A tree's two boards (📜 Hall of Fame, 🌱 Active Learners), readable by anyone
// who can read the tree, plus the signed-in viewer's own standing (with their rank) and their
// tournament level per statement (the compete launcher and the mindmap use them).
export async function getTournamentBoards(input: unknown): Promise<ActionResult<TournamentBoardsView>> {
  const parsed = GetTournamentBoardsDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)
  const { deckId } = parsed.data

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [boards, standing, levels] = await Promise.all([
    loadBoards(supabase, deckId),
    user ? findStanding(supabase, user.id, deckId) : null,
    user ? fetchTournamentLevels(supabase, user.id, deckId) : null,
  ])
  if (!boards.success) return boards
  // Your own standing and levels are nice-to-haves: the boards still show without them.
  const own = standing?.success ? standing.data : null
  return ok({
    ...boards.data,
    standing: own && user ? { ...own, rank: standingRank(boards.data, user.id) } : null,
    levels: levels?.success ? Object.fromEntries(levels.data) : {},
  })
}
