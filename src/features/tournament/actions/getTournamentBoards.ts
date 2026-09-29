'use server'

import { createClient } from '@/shared/lib/supabase/server'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { GetTournamentBoardsDto } from '../dto/TournamentDto'
import { findStanding, loadBoards } from '../services/boards'
import type { TournamentBoards, TournamentStanding } from '../types'

// Auth: Optional. A tree's two boards (📜 Bia Trạng Nguyên, 🌱 Đang Rèn Luyện), readable by anyone
// who can read the tree, plus the signed-in viewer's own standing (null otherwise).
export async function getTournamentBoards(input: unknown): Promise<ActionResult<TournamentBoards & { standing: TournamentStanding | null }>> {
  const parsed = GetTournamentBoardsDto.safeParse(input)
  if (!parsed.success) return fail('VALIDATION_FAILED', parsed.error.issues[0].message)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [boards, standing] = await Promise.all([
    loadBoards(supabase, parsed.data.deckId),
    user ? findStanding(supabase, user.id, parsed.data.deckId) : null,
  ])
  if (!boards.success) return boards
  // Your own standing is a nice-to-have: the boards still show without it.
  return ok({ ...boards.data, standing: standing?.success ? standing.data : null })
}
