import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/shared/lib/supabase/admin'
import type { TrapRules } from '@/shared/lib/trapEngine'
import type { Database, Json } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { TrapRulesDto } from '../dto/TrapRulesDto'

// The ONLY place that reads content_nodes.trap_rules (enforced by
// src/features/decks/__tests__/answerSecrecy.test.ts).
//
// Statement text (content_nodes.content) is readable by anyone who can read the tree since migration
// 20261013000000: visitors read a shared tree's statements anyway, and only the owner is graded.
// trap_rules stay service-role only, so they are read here with the service-role client. Callers must
// first confirm, with the user's own client (RLS), that the nodes are readable: the admin client
// skips RLS. Without SUPABASE_SERVICE_ROLE_KEY it falls back to the user's client, which then can't
// read the column (Postgres answers 42501 and we log how to fix it).

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
    console.warn('[decks] SUPABASE_SERVICE_ROLE_KEY is not set: reading trap rules with the user client, which the column privileges refuse.')
  }
  return userClient
}

// Trap rules of the given (already authorized) statement ids.
export async function readTrapRules(userClient: SupabaseClient<Database>, ids: readonly string[]): Promise<ActionResult<Map<string, TrapRules>>> {
  const rules = new Map<string, TrapRules>()
  if (ids.length === 0) return ok(rules)
  const client = answersClient(userClient)
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await client
      .from('content_nodes')
      .select('id, trap_rules')
      .in('id', ids.slice(i, i + ID_CHUNK))
    if (error) {
      if (error.code === PERMISSION_DENIED) console.error('[decks] trap rules are column-protected: set SUPABASE_SERVICE_ROLE_KEY on the server')
      else console.error('[decks] readTrapRules failed', error)
      return fail('INTERNAL_ERROR', 'Could not load the statements')
    }
    for (const row of data) rules.set(row.id, parseTrapRules(row.trap_rules, row.id))
  }
  return ok(rules)
}
