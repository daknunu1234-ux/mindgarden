import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listDrillItems } from '@/features/decks/server'
import { generateTraps } from '@/shared/lib/trapEngine'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import type { GetDrillSessionInput } from '../dto/GetDrillSessionDto'
import { drillSeed } from '../lib/drillSeed'
import type { DrillQuestion, DrillSession } from '../types'

// Builds a shuffled practice round for a deck. Answers stay on the server:
// questions carry only choices + seed, and checkDrillAnswer re-runs the engine to grade.
export async function buildDrillSession(
  supabase: SupabaseClient<Database>,
  input: GetDrillSessionInput,
  sessionId: string,
): Promise<ActionResult<DrillSession>> {
  const ref = 'deckId' in input ? { deckId: input.deckId } : { slug: input.slug }
  const res = await listDrillItems(supabase, ref)
  if (!res.success) return res

  const questions: DrillQuestion[] = []
  let skippedCount = 0
  for (const item of res.data.items) {
    const seed = drillSeed(item.id, sessionId)
    const traps = generateTraps(item.correctStmt, item.trapRules, seed)
    if (!traps.ok) {
      skippedCount += 1
      continue
    }
    questions.push({ itemId: item.id, nodeTitle: item.nodeTitle, prompt: item.prompt, seed, choices: traps.choices })
  }

  if (questions.length === 0) {
    return fail('DRILL_NO_ITEMS', 'This deck has no drillable items yet')
  }

  const round = seededShuffle(questions, seededRandom(sessionId)).slice(0, input.limit)
  return ok({ deck: res.data.deck, sessionId, questions: round, skippedCount })
}
