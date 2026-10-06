import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { TrapRules } from '@/shared/lib/trapEngine'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { outlineRows } from '../lib/contentTree'
import { parentContext } from '../lib/statements'
import { readTrapRules } from './answers'
import type { NodeType } from '../types'

// Server-only shapes: these carry trap rules, so they must never reach the client.
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
  // The statement's nearest root above (its "node" for branch rounds and sibling lookups).
  nodeId: string
  nodeTitle: string
  prompt: string
  correctStmt: string
  trapRules: TrapRules
  // Text of the other statements with the same nearest root, for sibling concept swaps.
  siblingStatements: string[]
  // Breadcrumb: the titles of the roots above the statement, top-level first, and their ids. The
  // question engine reads notes in context (a predicate-only note inherits its root as subject;
  // recognition questions use other roots' notes as distractors). A statement right under a short
  // statement (decks/lib/statements parentContext) gets that statement as the last step, with its
  // id: "sản sinh ATP" under "Ty thể" is asked as "Ty thể sản sinh ATP".
  path: string[]
  ancestry: string[]
  // The statement it sits under, null when it sits right under a root. Every statement is drilled
  // alike, at any depth.
  parentItemId?: string | null
}
export type DrillGradingItem = Pick<DrillSourceItem, 'id' | 'correctStmt' | 'trapRules' | 'siblingStatements'> & {
  // Owner of the item's deck: grading refuses anyone else (read-only visitors).
  ownerId: string
  // The item's tree (a saved answer logs a practice day for it: tree fruit).
  deckId: string
  // Every item of the deck, exactly as listDrillItems returns them: the question engine needs the
  // same context to rebuild the question it showed, or the correct tag would differ.
  deckItems: DrillSourceItem[]
}
export type DeckRef = { deckId: string } | { slug: string }
// A root, with its nearest root above (null for a top-level root): the tree branch rounds walk.
export type DrillNode = { id: string; parentId: string | null; title: string }

type NodeRow = { id: string; parent_id: string | null; node_type: NodeType; content: string; sort_order: number; created_at: string }

// Practice is "every content node of type statement" of a tree (or under a root): one table, no
// join. The user client (RLS) decides what is visible; answers.ts then reads the trap rules.
export async function listDrillItems(
  supabase: SupabaseClient<Database>,
  ref: DeckRef,
): Promise<ActionResult<{ deck: DrillDeck; nodes: DrillNode[]; items: DrillSourceItem[] }>> {
  // '*' (decks holds nothing secret) so this still works before migration 20260928000900 adds
  // is_tournament_open.
  const deckQuery = supabase.from('decks').select('*')
  const nodesOf = (deckId: string) => supabase.from('content_nodes').select('id, parent_id, node_type, content, sort_order, created_at').eq('deck_id', deckId)
  // By id (grading, tournaments: every answer) the deck row and its outline load in parallel, one
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

  const { data, error: nodesError } = earlyNodes ?? (await nodesOf(deck.id))
  if (nodesError) {
    console.error('[decks] listDrillItems: nodes query failed', nodesError)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }
  const rows = outlineRows(
    (data as NodeRow[]).map((n) => ({ id: n.id, parentId: n.parent_id, type: n.node_type, content: n.content, sortOrder: n.sort_order, createdAt: n.created_at })),
  )
  const statements = rows.filter((r) => r.type === 'statement')
  const rules = await readTrapRules(
    supabase,
    statements.map((s) => s.id),
  )
  if (!rules.success) return rules

  const byId = new Map(rows.map((r) => [r.id, r]))
  // The roots above a node, top-level first.
  const rootChain = (id: string) => {
    const chain: { id: string; title: string }[] = []
    const seen = new Set<string>()
    for (let at = byId.get(id)?.parentId ? byId.get(byId.get(id)!.parentId!) : undefined; at && !seen.has(at.id); at = at.parentId ? byId.get(at.parentId) : undefined) {
      seen.add(at.id)
      if (at.type === 'root') chain.unshift({ id: at.id, title: at.content })
    }
    return chain
  }
  const nodes: DrillNode[] = rows
    .filter((r) => r.type === 'root')
    .map((r) => ({ id: r.id, parentId: rootChain(r.id).at(-1)?.id ?? null, title: r.content }))

  const chains = new Map(statements.map((s) => [s.id, rootChain(s.id)]))
  const items: DrillSourceItem[] = statements.flatMap((s) => {
    const chain = chains.get(s.id)!
    const root = chain.at(-1)
    if (!root) return []
    const parent = s.parentId ? byId.get(s.parentId) : undefined
    const parentItemId = parent?.type === 'statement' ? parent.id : null
    const context = parent?.type === 'statement' ? parentContext(parent.content) : null
    const path = chain.map((c) => c.title)
    const ancestry = chain.map((c) => c.id)
    return [
      {
        id: s.id,
        nodeId: root.id,
        nodeTitle: root.title,
        prompt: root.title,
        correctStmt: s.content,
        trapRules: rules.data.get(s.id) ?? {},
        siblingStatements: statements.filter((o) => o.id !== s.id && chains.get(o.id)!.at(-1)?.id === root.id).map((o) => o.content),
        path: context ? [...path, context] : path,
        ancestry: context && parentItemId ? [...ancestry, parentItemId] : ancestry,
        parentItemId,
      },
    ]
  })

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
    nodes,
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

// One statement with its trap rules, for server-side grading, plus the whole deck as listDrillItems
// loads it: the question engine must see the same context the session saw, or the correct tag would
// differ. The user client (RLS) proves the node is readable first.
export async function findDrillItem(supabase: SupabaseClient<Database>, itemId: string): Promise<ActionResult<DrillGradingItem>> {
  const { data, error } = await supabase.from('content_nodes').select('id, deck_id, node_type').eq('id', itemId).maybeSingle()
  if (error) {
    console.error('[decks] findDrillItem failed', error)
    return fail('INTERNAL_ERROR', 'Could not load item')
  }
  if (!data || data.node_type !== 'statement') return fail('ITEM_NOT_FOUND', 'Item not found')

  const deck = await listDrillItems(supabase, { deckId: data.deck_id })
  if (!deck.success) return deck.error.code === 'DECK_NOT_FOUND' ? fail('ITEM_NOT_FOUND', 'Item not found') : deck
  const own = deck.data.items.find((i) => i.id === data.id)
  if (!own) return fail('ITEM_NOT_FOUND', 'Item not found')

  return ok({
    id: own.id,
    correctStmt: own.correctStmt,
    trapRules: own.trapRules,
    siblingStatements: own.siblingStatements,
    ownerId: deck.data.deck.ownerId,
    deckId: deck.data.deck.id,
    deckItems: deck.data.items,
  })
}
