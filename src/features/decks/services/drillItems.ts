import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrapRules } from '@/shared/lib/trapEngine'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { answersByNode, readAnswersForNodes } from './answers'

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

// Every knowledge item in a deck, with its node title, for building a drill session.
// The user client (RLS) decides what is visible; answers.ts then reads the statements.
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
    .select('id, parent_id, title, knowledge_items(id, prompt, created_at)')
    .eq('deck_id', deck.id)
    .order('sort_order')

  if (nodesError) {
    console.error('[decks] listDrillItems: nodes query failed', nodesError)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }

  const answers = await readAnswersForNodes(
    supabase,
    nodes.map((n) => n.id),
  )
  if (!answers.success) return answers
  const byNode = answersByNode(answers.data)
  const byItem = new Map(answers.data.map((a) => [a.itemId, a]))

  // Siblings = every other statement in the node, exactly what findDrillItem uses for grading.
  // The engine sorts them, so their order doesn't matter.
  const items: DrillSourceItem[] = nodes.flatMap((node) =>
    [...node.knowledge_items]
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .flatMap((item) => {
        const answer = byItem.get(item.id)
        if (!answer) return []
        return [
          {
            id: item.id,
            nodeId: node.id,
            nodeTitle: node.title,
            prompt: item.prompt,
            correctStmt: answer.correctStmt,
            trapRules: answer.trapRules,
            siblingStatements: (byNode.get(node.id) ?? []).filter((a) => a.itemId !== item.id).map((a) => a.correctStmt),
          },
        ]
      }),
  )

  return ok({
    deck: { id: deck.id, slug: deck.slug, title: deck.title, treeType: deck.tree_type },
    nodes: nodes.map((n) => ({ id: n.id, parentId: n.parent_id, title: n.title })),
    items,
  })
}

// One item with its answer and its node siblings, for server-side grading.
// Must feed the engine the same siblings as listDrillItems, or the correct tag would differ.
// The user client (RLS) proves the item is readable before any answer is read.
export async function findDrillItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
): Promise<ActionResult<DrillGradingItem>> {
  const { data, error } = await supabase
    .from('knowledge_items')
    .select('id, node_id')
    .eq('id', itemId)
    .maybeSingle()

  if (error) {
    console.error('[decks] findDrillItem failed', error)
    return fail('INTERNAL_ERROR', 'Could not load item')
  }
  if (!data) return fail('ITEM_NOT_FOUND', 'Item not found')

  const answers = await readAnswersForNodes(supabase, [data.node_id])
  if (!answers.success) return answers
  const own = answers.data.find((a) => a.itemId === data.id)
  if (!own) return fail('ITEM_NOT_FOUND', 'Item not found')

  return ok({
    id: own.itemId,
    correctStmt: own.correctStmt,
    trapRules: own.trapRules,
    siblingStatements: answers.data.filter((a) => a.itemId !== own.itemId).map((a) => a.correctStmt),
  })
}
