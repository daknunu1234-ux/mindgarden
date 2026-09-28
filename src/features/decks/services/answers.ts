import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import type { TrapRules } from '@/shared/lib/trapEngine'
import type { Database, Json } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { TrapRulesDto } from '../dto/TrapRulesDto'

// The ONLY place that reads knowledge_items.correct_stmt / trap_rules
// (enforced by src/features/decks/__tests__/answerSecrecy.test.ts).
//
// After migration 20260928000100_hide_knowledge_answers, anon/authenticated cannot SELECT
// these columns, so reads go through the service-role client. Callers must first confirm,
// with the user's own client (RLS), that the nodes are readable: the admin client skips RLS.
// Without SUPABASE_SERVICE_ROLE_KEY it falls back to the user's client, which works only
// until the migration is applied (then Postgres answers 42501 and we log how to fix it).

export type Answer = { itemId: string; nodeId: string; correctStmt: string; trapRules: TrapRules }

const ID_CHUNK = 100
const PERMISSION_DENIED = '42501'

let warnedFallback = false

// Malformed trap_rules fall back to {} so the item can still use built-in traps.
function parseTrapRules(raw: Json, itemId: string): TrapRules {
  const parsed = TrapRulesDto.safeParse(raw)
  if (parsed.success) return parsed.data
  console.warn('[decks] invalid trap_rules, using {}', itemId, parsed.error.issues[0]?.message)
  return {}
}

function answersClient(userClient: SupabaseClient<Database>): SupabaseClient<Database> {
  const admin = createAdminClient()
  if (admin) return admin
  if (!warnedFallback) {
    warnedFallback = true
    console.warn(
      '[decks] SUPABASE_SERVICE_ROLE_KEY is not set: reading answers with the user client. ' +
        'This stops working once the hide_knowledge_answers migration is applied.',
    )
  }
  return userClient
}

// Answers of every item in the given (already authorized) nodes, oldest first.
export async function readAnswersForNodes(
  userClient: SupabaseClient<Database>,
  nodeIds: readonly string[],
): Promise<ActionResult<Answer[]>> {
  if (nodeIds.length === 0) return ok([])
  const client = answersClient(userClient)
  const answers: Answer[] = []

  for (let i = 0; i < nodeIds.length; i += ID_CHUNK) {
    const { data, error } = await client
      .from('knowledge_items')
      .select('id, node_id, correct_stmt, trap_rules')
      .in('node_id', nodeIds.slice(i, i + ID_CHUNK))
      .order('created_at')
      .order('id')

    if (error) {
      if (error.code === PERMISSION_DENIED) {
        console.error('[decks] answers are column-protected: set SUPABASE_SERVICE_ROLE_KEY on the server')
      } else {
        console.error('[decks] readAnswersForNodes failed', error)
      }
      return fail('INTERNAL_ERROR', 'Could not load the statements')
    }
    for (const row of data) {
      answers.push({
        itemId: row.id,
        nodeId: row.node_id,
        correctStmt: row.correct_stmt,
        trapRules: parseTrapRules(row.trap_rules, row.id),
      })
    }
  }
  return ok(answers)
}

// Groups answers by node for sibling lookups.
export function answersByNode(answers: readonly Answer[]): Map<string, Answer[]> {
  const byNode = new Map<string, Answer[]>()
  for (const a of answers) byNode.set(a.nodeId, [...(byNode.get(a.nodeId) ?? []), a])
  return byNode
}
