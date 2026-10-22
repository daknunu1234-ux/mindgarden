import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { ImportOutlineInput } from '../dto/ImportOutlineDto'
import { DEFAULT_TRAP_RULES } from '../lib/drillable'
import { planOutline, type PlannedLine } from '../lib/outlinePlan'
import { checkDeckOwner } from './authoring'

type Client = SupabaseClient<Database>

export type ImportedOutline = { slug: string; roots: number; subRoots: number; statements: number }

// A document's outline into the owner's tree (public.content_nodes), after the roots already there:
// depth by depth (the top-level roots, then every row one level below them, …), each depth in ONE
// insert with the player's session (RLS: the owner's tree only). Parents' ids come back in insert
// order, so every child knows its parent. If a later depth fails, the top-level roots already added
// are deleted again (their branches go by cascade), so the tree never keeps half an import.
// Counts: roots = top-level roots, subRoots = the roots below them, statements = every statement.
export async function insertOutline(supabase: Client, userId: string, { deckId, items }: ImportOutlineInput): Promise<ActionResult<ImportedOutline>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  const { data: existing, error: topError } = await supabase.from('content_nodes').select('sort_order').eq('deck_id', deckId).is('parent_id', null)
  if (topError) {
    console.error('[decks] insertOutline lookup failed', topError.code, topError.message)
    return fail('INTERNAL_ERROR', 'Could not import the outline')
  }
  const base = (existing ?? []).reduce((max, r) => Math.max(max, Number(r.sort_order)), 0)

  const plan = planOutline(items)
  const ids = new Map<number, string>()
  const insertDepth = async (lines: PlannedLine[]): Promise<boolean> => {
    if (lines.length === 0) return true
    const rows = lines.map((l) => ({
      deck_id: deckId,
      parent_id: l.parent === null ? null : ids.get(l.parent)!,
      content: l.text,
      node_type: l.type,
      trap_rules: l.type === 'statement' ? DEFAULT_TRAP_RULES : {},
      sort_order: l.parent === null ? base + l.order : l.order,
    }))
    const { data, error } = await supabase.from('content_nodes').insert(rows).select('id')
    if (error || !data || data.length !== rows.length) {
      console.error('[decks] insertOutline insert failed', error?.code, error?.message)
      return false
    }
    // Rows come back in insert order.
    lines.forEach((l, i) => ids.set(l.index, data[i].id))
    return true
  }

  const tops = plan.filter((l) => l.depth === 0)
  if (!(await insertDepth(tops))) return fail('INTERNAL_ERROR', 'Could not import the outline')
  const deepest = Math.max(0, ...plan.map((l) => l.depth))
  for (let depth = 1; depth <= deepest; depth++) {
    if (await insertDepth(plan.filter((l) => l.depth === depth))) continue
    const added = tops.map((l) => ids.get(l.index)).filter((id): id is string => !!id)
    const { error } = await supabase.from('content_nodes').delete().in('id', added)
    if (error) console.error('[decks] insertOutline rollback failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not import the outline; nothing was added')
  }
  return ok({
    slug: owner.data.slug,
    roots: tops.length,
    subRoots: plan.filter((l) => l.depth > 0 && l.type === 'root').length,
    statements: plan.filter((l) => l.type === 'statement').length,
  })
}
