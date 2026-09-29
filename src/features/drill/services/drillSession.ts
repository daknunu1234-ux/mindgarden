import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { listDrillItems } from '@/features/decks/server'
import { generateTraps } from '@/shared/lib/trapEngine'
import { canPractice, VISITOR_PRACTICE_MESSAGE } from '@/shared/lib/visitor'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { seededRandom, seededShuffle } from '@/shared/utils/seededRandom'
import type { GetDrillSessionInput } from '../dto/GetDrillSessionDto'
import { collectBranch } from '../lib/branch'
import { drillSeed } from '../lib/drillSeed'
import { emptyRoundReason, selectPracticeItems } from '../lib/queue'
import type { DrillQuestion, DrillSession } from '../types'

// Builds a shuffled practice round for a deck, or for one branch when input.nodeId is set
// (that node and all its sub-roots). Answers stay on the server:
// questions carry only choices + seed, and checkDrillAnswer re-runs the engine to grade.
// Only the deck's OWNER may practise it (strict read-only visitor mode): anyone else, including a
// signed-out visitor, gets FORBIDDEN_VISITOR_PRACTICE and must clone the tree first.
// `loadLevels` returns the player's mastery for the given items: 5/5 items sit out unless
// input.includeMastered (review mode).
export type LoadLevels = (itemIds: string[]) => Promise<ReadonlyMap<string, number>>

export async function buildDrillSession(
  supabase: SupabaseClient<Database>,
  input: GetDrillSessionInput,
  sessionId: string,
  { viewerId, loadLevels }: { viewerId: string | null; loadLevels?: LoadLevels },
): Promise<ActionResult<DrillSession>> {
  const ref = 'deckId' in input ? { deckId: input.deckId } : { slug: input.slug }
  const res = await listDrillItems(supabase, ref)
  if (!res.success) return res
  if (!canPractice(res.data.deck.ownerId, viewerId)) return fail('FORBIDDEN_VISITOR_PRACTICE', VISITOR_PRACTICE_MESSAGE)

  let items = res.data.items
  let focus: DrillSession['focus'] = null
  if (input.nodeId) {
    const node = res.data.nodes.find((n) => n.id === input.nodeId)
    if (!node) return fail('NODE_NOT_FOUND', 'Root not found in this deck')
    const branch = collectBranch(res.data.nodes, node.id)
    items = items.filter((item) => branch.has(item.nodeId))
    focus = { nodeId: node.id, title: node.title }
  }

  const drillable: DrillQuestion[] = []
  let skippedCount = 0
  for (const item of items) {
    const seed = drillSeed(item.id, sessionId)
    // Items of the same node act as siblings: their subjects become the best traps.
    const traps = generateTraps(item.correctStmt, item.trapRules, seed, item.siblingStatements)
    if (!traps.ok) {
      skippedCount += 1
      continue
    }
    drillable.push({ itemId: item.id, nodeTitle: item.nodeTitle, prompt: item.prompt, seed, choices: traps.choices })
  }

  const levels = loadLevels && drillable.length > 0 ? await loadLevels(drillable.map((q) => q.itemId)) : new Map<string, number>()
  const { queue, masteredCount } = selectPracticeItems(drillable, levels, input.includeMastered)
  const empty = emptyRoundReason(drillable.length, queue.length)
  if (empty === 'no-items') {
    return fail('DRILL_NO_ITEMS', focus ? 'This branch has no drillable items yet' : 'This deck has no drillable items yet')
  }
  if (empty === 'all-mastered') {
    return fail('DRILL_ALL_MASTERED', focus ? 'Every statement in this branch is mastered' : 'Every statement in this tree is mastered')
  }

  const round = seededShuffle(queue, seededRandom(sessionId)).slice(0, input.limit)
  return ok({
    deck: res.data.deck,
    sessionId,
    focus,
    questions: round,
    skippedCount,
    masteredCount,
    includeMastered: input.includeMastered,
  })
}
