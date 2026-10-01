import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrapRules } from '@/shared/lib/trapEngine'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { answersByNode, readAnswersForNodes } from './answers'

// Server-only shapes: these carry correctStmt, so they must never reach the client.
// ownerId: only the owner may practise a deck (visitors are read-only; see drill/services/drillSession).
// isPublic + isTournamentOpen: the one exception, Mind Tournament rounds (shared/lib/visitor tournamentAccess).
export type DrillDeck = {
  id: string
  slug: string
  title: string
  treeType: string
  ownerId: string
  isPublic: boolean
  isTournamentOpen: boolean
}
export type DrillSourceItem = {
  id: string
  nodeId: string
  nodeTitle: string
  prompt: string
  correctStmt: string
  trapRules: TrapRules
  // True statements of the other items in the same node, for sibling concept swaps.
  siblingStatements: string[]
  // Breadcrumb: root titles from the top-level root down to this item's root, and their ids. The
  // question engine reads notes in context (a predicate-only note inherits its root as subject;
  // recognition questions use other roots' notes as distractors).
  path: string[]
  ancestry: string[]
}
export type DrillGradingItem = Pick<DrillSourceItem, 'id' | 'correctStmt' | 'trapRules' | 'siblingStatements'> & {
  // Owner of the item's deck: grading refuses anyone else (read-only visitors).
  ownerId: string
  // Every item of the deck, exactly as listDrillItems returns them: the question engine needs the
  // same context to rebuild the question it showed, or the correct tag would differ.
  deckItems: DrillSourceItem[]
}
export type DeckRef = { deckId: string } | { slug: string }
export type DrillNode = { id: string; parentId: string | null; title: string }

// Every knowledge item in a deck, with its node title, for building a drill session.
// The user client (RLS) decides what is visible; answers.ts then reads the statements.
export async function listDrillItems(
  supabase: SupabaseClient<Database>,
  ref: DeckRef,
): Promise<ActionResult<{ deck: DrillDeck; nodes: DrillNode[]; items: DrillSourceItem[] }>> {
  // '*' (decks holds nothing secret) so this still works before migration 20260928000900 adds
  // is_tournament_open.
  const deckQuery = supabase.from('decks').select('*')
  const nodesOf = (deckId: string) =>
    supabase.from('mindmap_nodes').select('id, parent_id, title, knowledge_items(id, prompt, created_at)').eq('deck_id', deckId).order('sort_order')
  // By id (grading, tournaments: every answer) the deck row and its roots load in parallel, one
  // round trip instead of two; by slug the deck's id is needed first.
  const [deckRes, earlyNodes] = await Promise.all([
    ('deckId' in ref ? deckQuery.eq('id', ref.deckId) : deckQuery.eq('slug', ref.slug)).maybeSingle(),
    'deckId' in ref ? nodesOf(ref.deckId) : null,
  ])
  const { data: deck, error: deckError } = deckRes

  if (deckError) {
    console.error('[decks] listDrillItems: deck query failed', deckError)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }
  if (!deck) return fail('DECK_NOT_FOUND', 'Deck not found')

  const { data: nodes, error: nodesError } = earlyNodes ?? (await nodesOf(deck.id))

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
  const lineage = nodeLineage(nodes.map((n) => ({ id: n.id, parentId: n.parent_id, title: n.title })))

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
            path: lineage.get(node.id)?.path ?? [node.title],
            ancestry: lineage.get(node.id)?.ancestry ?? [node.id],
          },
        ]
      }),
  )

  return ok({
    deck: {
      id: deck.id,
      slug: deck.slug,
      title: deck.title,
      treeType: deck.tree_type,
      ownerId: deck.user_id,
      isPublic: deck.is_public,
      isTournamentOpen: deck.is_tournament_open ?? false,
    },
    nodes: nodes.map((n) => ({ id: n.id, parentId: n.parent_id, title: n.title })),
    items,
  })
}

// Root id → its breadcrumb (titles and ids from the top-level root down to it). A cycle or a
// missing parent just ends the walk, so a malformed tree never loops.
export function nodeLineage(nodes: readonly DrillNode[]): Map<string, { path: string[]; ancestry: string[] }> {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const out = new Map<string, { path: string[]; ancestry: string[] }>()
  for (const node of nodes) {
    const chain: DrillNode[] = []
    const seen = new Set<string>()
    for (let at: DrillNode | undefined = node; at && !seen.has(at.id); at = at.parentId ? byId.get(at.parentId) : undefined) {
      seen.add(at.id)
      chain.unshift(at)
    }
    out.set(node.id, { path: chain.map((n) => n.title), ancestry: chain.map((n) => n.id) })
  }
  return out
}

// One item with its answer, for server-side grading, plus the whole deck as listDrillItems loads it:
// the question engine must see the same context the session saw, or the correct tag would differ.
// The user client (RLS) proves the item is readable before any answer is read.
export async function findDrillItem(
  supabase: SupabaseClient<Database>,
  itemId: string,
): Promise<ActionResult<DrillGradingItem>> {
  const { data, error } = await supabase
    .from('knowledge_items')
    .select('id, node_id, mindmap_nodes(deck_id)')
    .eq('id', itemId)
    .maybeSingle()

  if (error) {
    console.error('[decks] findDrillItem failed', error)
    return fail('INTERNAL_ERROR', 'Could not load item')
  }
  const deckId = (data?.mindmap_nodes as { deck_id: string } | null)?.deck_id
  if (!data || !deckId) return fail('ITEM_NOT_FOUND', 'Item not found')

  const deck = await listDrillItems(supabase, { deckId })
  if (!deck.success) return deck.error.code === 'DECK_NOT_FOUND' ? fail('ITEM_NOT_FOUND', 'Item not found') : deck
  const own = deck.data.items.find((i) => i.id === data.id)
  if (!own) return fail('ITEM_NOT_FOUND', 'Item not found')

  return ok({
    id: own.id,
    correctStmt: own.correctStmt,
    trapRules: own.trapRules,
    siblingStatements: own.siblingStatements,
    ownerId: deck.data.deck.ownerId,
    deckItems: deck.data.items,
  })
}
