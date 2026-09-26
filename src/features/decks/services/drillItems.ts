import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrapRules } from '@/shared/lib/trapEngine'
import type { Database, Json } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { TrapRulesDto } from '../dto/TrapRulesDto'

// Server-only shapes: these carry correctStmt, so they must never reach the client.
export type DrillDeck = { id: string; slug: string; title: string; treeType: string }
export type DrillSourceItem = {
  id: string
  nodeId: string
  nodeTitle: string
  prompt: string
  correctStmt: string
  trapRules: TrapRules
  // True statements of the other items in the same node, for sibling concept swaps.
  siblingStatements: string[]
}
export type DrillGradingItem = Pick<DrillSourceItem, 'id' | 'correctStmt' | 'trapRules' | 'siblingStatements'>
export type DeckRef = { deckId: string } | { slug: string }
export type DrillNode = { id: string; parentId: string | null; title: string }

// Malformed trap_rules fall back to {} so the item can still use built-in traps.
function parseTrapRules(raw: Json, itemId: string): TrapRules {
  const parsed = TrapRulesDto.safeParse(raw)
  if (parsed.success) return parsed.data
  console.warn('[decks] invalid trap_rules, using {}', itemId, parsed.error.issues[0]?.message)
  return {}
}

// Every knowledge item in a deck, with its node title, for building a drill session.
export async function listDrillItems(
  supabase: SupabaseClient<Database>,
  ref: DeckRef,
): Promise<ActionResult<{ deck: DrillDeck; nodes: DrillNode[]; items: DrillSourceItem[] }>> {
  const deckQuery = supabase.from('decks').select('id, slug, title, tree_type')
  const { data: deck, error: deckError } = await ('deckId' in ref
    ? deckQuery.eq('id', ref.deckId)
    : deckQuery.eq('slug', ref.slug)
  ).maybeSingle()

  if (deckError) {
    console.error('[decks] listDrillItems: deck query failed', deckError)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }
  if (!deck) return fail('DECK_NOT_FOUND', 'Deck not found')

  const { data: nodes, error: nodesError } = await supabase
    .from('mindmap_nodes')
    .select('id, parent_id, title, knowledge_items(id, prompt, correct_stmt, trap_rules, created_at)')
    .eq('deck_id', deck.id)
    .order('sort_order')

  if (nodesError) {
    console.error('[decks] listDrillItems: nodes query failed', nodesError)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }

  // Siblings are grouped per node here; the engine sorts them, so their order doesn't matter.
  const items = nodes.flatMap((node) =>
    [...node.knowledge_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((item) => ({
        id: item.id,
        nodeId: node.id,
        nodeTitle: node.title,
        prompt: item.prompt,
        correctStmt: item.correct_stmt,
        trapRules: parseTrapRules(item.trap_rules, item.id),
        siblingStatements: node.knowledge_items.filter((other) => other.id !== item.id).map((other) => other.correct_stmt),
      })),
  )

  return ok({
    deck: { id: deck.id, slug: deck.slug, title: deck.title, treeType: deck.tree_type },
    nodes: nodes.map((n) => ({ id: n.id, parentId: n.parent_id, title: n.title })),
    items,
  })
}

// One item with its answer and its node siblings, for server-side grading.
// Must feed the engine the same siblings as listDrillItems, or the correct tag would differ.
// RLS hides items of unreadable decks.
export async function findDrillItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
): Promise<ActionResult<DrillGradingItem>> {
  const { data, error } = await supabase
    .from('knowledge_items')
    .select('id, node_id, correct_stmt, trap_rules')
    .eq('id', itemId)
    .maybeSingle()

  if (error) {
    console.error('[decks] findDrillItem failed', error)
    return fail('INTERNAL_ERROR', 'Could not load item')
  }
  if (!data) return fail('ITEM_NOT_FOUND', 'Item not found')

  const { data: siblings, error: siblingsError } = await supabase
    .from('knowledge_items')
    .select('correct_stmt')
    .eq('node_id', data.node_id)
    .neq('id', data.id)

  if (siblingsError) {
    console.error('[decks] findDrillItem siblings failed', siblingsError)
    return fail('INTERNAL_ERROR', 'Could not load item')
  }

  return ok({
    id: data.id,
    correctStmt: data.correct_stmt,
    trapRules: parseTrapRules(data.trap_rules, data.id),
    siblingStatements: siblings.map((s) => s.correct_stmt),
  })
}
