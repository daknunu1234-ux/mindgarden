import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { SEED_PRICE_COINS } from '@/shared/lib/economy'
import { slugify } from '@/shared/utils/slugify'
import type { CloneDeckInput } from '../dto/CloneDeckDto'
import type { CreateDeckInput } from '../dto/CreateDeckDto'
import type { CreateKnowledgeItemInput } from '../dto/CreateKnowledgeItemDto'
import type { CreateKnowledgeItemsInput } from '../dto/CreateKnowledgeItemsDto'
import type { CreateMindmapNodeInput } from '../dto/CreateMindmapNodeDto'
import type { SetTournamentOpenInput } from '../dto/SetTournamentOpenDto'
import type { DeleteDeckInput } from '../dto/DeleteDeckDto'
import type { UpdateDeckInput } from '../dto/UpdateDeckDto'
import type {
  DeleteKnowledgeItemInput,
  DeleteMindmapNodeInput,
  DeleteRootBranchInput,
  UpdateKnowledgeItemInput,
  UpdateMindmapNodeInput,
} from '../dto/ManageRootsDto'
import { branchNodeIds } from '../lib/branch'
import { DEFAULT_TRAP_RULES, isDrillable } from '../lib/drillable'
import { answersByNode, readAnswersForNodes } from './answers'
import { toDeck } from './decks'
import type { Deck, DeckEditor, EditorNode } from '../types'

type Client = SupabaseClient<Database>

// Slugs that would collide with static routes under /deck.
const RESERVED_SLUGS = new Set(['new'])
const UNIQUE_VIOLATION = '23505'
const FK_VIOLATION = '23503'

function* slugCandidates(title: string) {
  const base = slugify(title)
  if (!RESERVED_SLUGS.has(base)) yield base
  for (let n = 2; n <= 5; n++) yield `${base}-${n}`
  // Private decks of other users are invisible (RLS), so collisions can't be listed up front.
  yield `${base}-${crypto.randomUUID().slice(0, 6)}`
}

export type PlantedDeck = { deck: Deck; remainingCoins: number }

// Plants a tree for SEED_PRICE_COINS through plant_deck() (migration 20260928000500), which charges
// the signed-in player and inserts the deck in one transaction. A slug collision (23505) rolls the
// charge back, so trying the next slug never charges twice. Players can't INSERT into decks
// directly, so the fee can't be skipped.
export async function plantDeck(supabase: Client, input: CreateDeckInput): Promise<ActionResult<PlantedDeck>> {
  for (const slug of slugCandidates(input.title)) {
    const { data, error } = await supabase.rpc('plant_deck', {
      p_title: input.title,
      p_slug: slug,
      p_description: input.description,
      p_is_public: input.isPublic,
      p_tree_type: input.treeType,
    })

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      if (error.message?.includes('INSUFFICIENT_COINS')) {
        return fail('INSUFFICIENT_COINS', `You need ${SEED_PRICE_COINS} coins to buy a seed for a new tree!`)
      }
      if (error.message?.includes('AUTH_UNAUTHORIZED')) return fail('AUTH_UNAUTHORIZED', 'Sign in to plant a tree')
      // PGRST202 / 42883: plant_deck is missing (run 20260928000500_seed_economy.sql).
      // 23503: the player has no public.users row (handle_new_user trigger missing?).
      console.error('[decks] plantDeck failed', error.code, error.message)
      return fail('INTERNAL_ERROR', 'Could not plant this tree')
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      console.error('[decks] plantDeck returned no row')
      return fail('INTERNAL_ERROR', 'Could not plant this tree')
    }
    // Read the new deck back with the player's own client (RLS: owner).
    const { data: deck, error: readError } = await supabase.from('decks').select('*').eq('id', row.deck_id).single()
    if (readError || !deck) {
      console.error('[decks] plantDeck read-back failed', readError)
      return fail('INTERNAL_ERROR', 'Your tree was planted, but we could not load it')
    }
    return ok({ deck: toDeck(deck), remainingCoins: row.remaining_coins })
  }
  return fail('INTERNAL_ERROR', 'Could not find a free link for this tree')
}

export type ClonedDeck = { deck: Deck; remainingCoins: number; cost: number }

// Clones another gardener's shared tree through clone_deck() (migration 20260928000700), which
// charges min(100 + statements, 150) 🪙 and deep-copies roots + statements in one transaction.
// Like plantDeck, a slug collision (23505) rolls the charge back, so the next slug never
// double-charges. Progress is never copied: the cloner starts every statement at 0/5.
export async function cloneSharedDeck(supabase: Client, { deckId }: CloneDeckInput): Promise<ActionResult<ClonedDeck>> {
  // Visible to the caller only if it's theirs or public (RLS); the RPC re-checks both.
  const { data: source, error: sourceError } = await supabase.from('decks').select('title').eq('id', deckId).maybeSingle()
  if (sourceError) {
    console.error('[decks] cloneSharedDeck source lookup failed', sourceError)
    return fail('INTERNAL_ERROR', 'Could not clone this tree')
  }
  if (!source) return fail('DECK_NOT_FOUND', 'This tree is not shared (anymore)')

  for (const slug of slugCandidates(source.title)) {
    const { data, error } = await supabase.rpc('clone_deck', { p_source_deck_id: deckId, p_slug: slug })

    if (error) {
      if (error.code === UNIQUE_VIOLATION) continue
      const message = error.message ?? ''
      if (message.includes('INSUFFICIENT_COINS')) {
        const cost = /(\d+) coins/.exec(error.hint ?? '')?.[1]
        return fail('INSUFFICIENT_COINS', cost ? `You need ${cost} coins to clone this tree!` : 'You need more coins to clone this tree!')
      }
      if (message.includes('CANNOT_CLONE_OWN_DECK')) return fail('AUTH_FORBIDDEN', 'This tree is already in your garden')
      if (message.includes('DECK_NOT_FOUND')) return fail('DECK_NOT_FOUND', 'This tree is not shared (anymore)')
      if (message.includes('AUTH_UNAUTHORIZED')) return fail('AUTH_UNAUTHORIZED', 'Sign in to clone this tree')
      // PGRST202 / 42883: clone_deck is missing (run 20260928000700_clone_deck.sql).
      console.error('[decks] cloneSharedDeck failed', error.code, error.message)
      return fail('INTERNAL_ERROR', 'Could not clone this tree')
    }

    const row = Array.isArray(data) ? data[0] : data
    if (!row) {
      console.error('[decks] cloneSharedDeck returned no row')
      return fail('INTERNAL_ERROR', 'Could not clone this tree')
    }
    const { data: deck, error: readError } = await supabase.from('decks').select('*').eq('id', row.deck_id).single()
    if (readError || !deck) {
      console.error('[decks] cloneSharedDeck read-back failed', readError)
      return fail('INTERNAL_ERROR', 'Your copy was planted, but we could not load it')
    }
    return ok({ deck: toDeck(deck), remainingCoins: row.remaining_coins, cost: row.cost })
  }
  return fail('INTERNAL_ERROR', 'Could not find a free link for this tree')
}

// RLS already blocks writes to other people's decks; this gives a clear error first.
async function checkDeckOwner(
  supabase: Client,
  deckId: string,
  userId: string,
): Promise<ActionResult<{ slug: string; treeType: string }>> {
  const { data, error } = await supabase.from('decks').select('user_id, slug, tree_type').eq('id', deckId).maybeSingle()
  if (error) {
    console.error('[decks] checkDeckOwner failed', error)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }
  if (!data) return fail('DECK_NOT_FOUND', 'Deck not found')
  if (data.user_id !== userId) return fail('AUTH_FORBIDDEN', 'Only the owner can edit this tree')
  return ok({ slug: data.slug, treeType: data.tree_type })
}

export async function insertMindmapNode(
  supabase: Client,
  userId: string,
  { deckId, title, parentId }: CreateMindmapNodeInput,
): Promise<ActionResult<{ id: string; title: string }>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  // Append after existing siblings.
  let siblings = supabase.from('mindmap_nodes').select('id', { count: 'exact', head: true }).eq('deck_id', deckId)
  siblings = parentId ? siblings.eq('parent_id', parentId) : siblings.is('parent_id', null)
  const { count, error: countError } = await siblings
  if (countError) {
    console.error('[decks] insertMindmapNode count failed', countError)
    return fail('INTERNAL_ERROR', 'Could not add the root')
  }

  const { data, error } = await supabase
    .from('mindmap_nodes')
    .insert({ deck_id: deckId, parent_id: parentId, title, sort_order: count ?? 0 })
    .select('id, title')
    .single()

  if (error) {
    // Composite FK (parent_id, deck_id): the parent is missing or in another deck.
    if (error.code === FK_VIOLATION) return fail('NODE_NOT_FOUND', 'Parent root not found in this deck')
    console.error('[decks] insertMindmapNode failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not add the root')
  }
  return ok(data)
}

export async function insertKnowledgeItem(
  supabase: Client,
  userId: string,
  { nodeId, statement }: CreateKnowledgeItemInput,
): Promise<ActionResult<{ id: string; drillable: boolean }>> {
  const { data: node, error: nodeError } = await supabase
    .from('mindmap_nodes')
    .select('id, title, deck_id')
    .eq('id', nodeId)
    .maybeSingle()

  if (nodeError) {
    console.error('[decks] insertKnowledgeItem node lookup failed', nodeError)
    return fail('INTERNAL_ERROR', 'Could not add the statement')
  }
  if (!node) return fail('NODE_NOT_FOUND', 'Root not found')

  const owner = await checkDeckOwner(supabase, node.deck_id, userId)
  if (!owner.success) return owner

  // Existing statements in this root become sibling-swap material for the new one
  // (read via answers.ts: the owner check above authorizes this node).
  const siblings = await readAnswersForNodes(supabase, [nodeId])
  if (!siblings.success) return siblings

  const { data, error } = await supabase
    .from('knowledge_items')
    .insert({
      node_id: nodeId,
      // prompt is required by the schema; the node title is the question's topic.
      prompt: node.title,
      correct_stmt: statement,
      trap_rules: DEFAULT_TRAP_RULES,
    })
    // RETURNING only id: writing correct_stmt is allowed, reading it back is not.
    .select('id')
    .single()

  if (error) {
    console.error('[decks] insertKnowledgeItem failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not add the statement')
  }
  const siblingStatements = siblings.data.map((s) => s.correctStmt)
  return ok({ id: data.id, drillable: isDrillable(statement, DEFAULT_TRAP_RULES, siblingStatements) })
}

export type BulkInsertResult = {
  slug: string
  created: { id: string; statement: string; drillable: boolean }[]
  // Statements already in this root (skipped, not duplicated).
  skipped: number
}

// Bulk import ("📋 Bulk Add via Notes / Bullets"): many statements for one root in ONE insert.
// Owner only, and the root must belong to the given deck. Each gets the same defaults as a typed
// statement (prompt = root title, trap_rules = { negate: true }); statements already in the root
// are skipped. Drillability counts the root's existing statements AND the new ones as siblings.
export async function insertKnowledgeItems(
  supabase: Client,
  userId: string,
  { deckId, rootId, statements }: CreateKnowledgeItemsInput,
): Promise<ActionResult<BulkInsertResult>> {
  const { data: node, error: nodeError } = await supabase.from('mindmap_nodes').select('id, title, deck_id').eq('id', rootId).maybeSingle()
  if (nodeError) {
    console.error('[decks] insertKnowledgeItems node lookup failed', nodeError)
    return fail('INTERNAL_ERROR', 'Could not import the statements')
  }
  if (!node || node.deck_id !== deckId) return fail('NODE_NOT_FOUND', 'Root not found in this tree')

  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  // The owner check above authorizes reading this root's statements (answers.ts).
  const existing = await readAnswersForNodes(supabase, [rootId])
  if (!existing.success) return existing
  const already = new Set(existing.data.map((s) => s.correctStmt.trim()))
  const fresh = [...new Set(statements)].filter((s) => !already.has(s))
  const skipped = statements.length - fresh.length
  if (fresh.length === 0) return ok({ slug: owner.data.slug, created: [], skipped })

  const { data, error } = await supabase
    .from('knowledge_items')
    .insert(fresh.map((statement) => ({ node_id: rootId, prompt: node.title, correct_stmt: statement, trap_rules: DEFAULT_TRAP_RULES })))
    // RETURNING only id: writing correct_stmt is allowed, reading it back is not.
    .select('id')

  if (error || !data || data.length !== fresh.length) {
    console.error('[decks] insertKnowledgeItems failed', error?.code, error?.message)
    return fail('INTERNAL_ERROR', 'Could not import the statements')
  }

  const all = [...existing.data.map((s) => s.correctStmt), ...fresh]
  return ok({
    slug: owner.data.slug,
    // Rows come back in insert order.
    created: fresh.map((statement, i) => ({
      id: data[i].id,
      statement,
      drillable: isDrillable(
        statement,
        DEFAULT_TRAP_RULES,
        all.filter((s) => s !== statement),
      ),
    })),
    skipped,
  })
}

// Owner-only view with the true statements, flattened in tree order for the editor.
export async function loadDeckEditor(supabase: Client, userId: string, deckId: string): Promise<ActionResult<DeckEditor>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner
  return flattenDeckStatements(supabase, deckId, owner.data.treeType)
}

// Read-only visitor view (strict visitor mode): the same roots + true statements, for a tree that
// is PUBLIC or the viewer's own. Visitors can read everything but can't practise it
// (FORBIDDEN_VISITOR_PRACTICE), so knowing the statements earns nothing: to drill they must clone.
// Private trees of others stay DECK_NOT_FOUND (RLS hides them, and is_public is re-checked here
// because answers.ts reads through the service role).
export async function loadDeckReader(supabase: Client, userId: string | null, deckId: string): Promise<ActionResult<DeckEditor>> {
  const { data, error } = await supabase.from('decks').select('user_id, is_public, tree_type').eq('id', deckId).maybeSingle()
  if (error) {
    console.error('[decks] loadDeckReader failed', error)
    return fail('INTERNAL_ERROR', 'Could not load this tree')
  }
  if (!data || !(data.is_public || data.user_id === userId)) return fail('DECK_NOT_FOUND', 'Deck not found')
  return flattenDeckStatements(supabase, deckId, data.tree_type)
}

// Roots in tree order with their statements. Callers must authorize the deck first (answers.ts
// reads with the service role).
async function flattenDeckStatements(supabase: Client, deckId: string, treeType: string): Promise<ActionResult<DeckEditor>> {
  const { data: nodes, error } = await supabase
    .from('mindmap_nodes')
    .select('id, parent_id, title, sort_order')
    .eq('deck_id', deckId)

  if (error) {
    console.error('[decks] flattenDeckStatements failed', error)
    return fail('INTERNAL_ERROR', 'Could not load the editor')
  }

  // Statements come from answers.ts (oldest first); the caller's check authorizes the deck.
  const answers = await readAnswersForNodes(
    supabase,
    nodes.map((n) => n.id),
  )
  if (!answers.success) return answers
  const byNode = answersByNode(answers.data)

  const childrenOf = new Map<string | null, typeof nodes>()
  for (const n of nodes) childrenOf.set(n.parent_id, [...(childrenOf.get(n.parent_id) ?? []), n])

  const flat: EditorNode[] = []
  const visit = (parentId: string | null, depth: number) => {
    const siblings = [...(childrenOf.get(parentId) ?? [])].sort(
      (a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title),
    )
    for (const n of siblings) {
      flat.push({
        id: n.id,
        title: n.title,
        depth,
        items: (byNode.get(n.id) ?? []).map((item, _, all) => ({
          id: item.itemId,
          statement: item.correctStmt,
          // Same siblings the drill session will use, so ✅/💧 matches what players get.
          drillable: isDrillable(
            item.correctStmt,
            item.trapRules,
            all.filter((other) => other.itemId !== item.itemId).map((other) => other.correctStmt),
          ),
        })),
      })
      visit(n.id, depth + 1)
    }
  }
  visit(null, 0)

  return ok({ deckId, treeType, nodes: flat })
}

// Owner-only settings change (title, description, species, visibility). RLS "decks: update own"
// is the final guard; the owner check gives AUTH_FORBIDDEN instead of a silent no-op.
export async function updateDeckSettings(
  supabase: Client,
  userId: string,
  { deckId, title, description, treeType, isPublic }: UpdateDeckInput,
): Promise<ActionResult<Deck>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  const { data, error } = await supabase
    .from('decks')
    .update({
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(treeType !== undefined && { tree_type: treeType }),
      ...(isPublic !== undefined && { is_public: isPublic }),
    })
    .eq('id', deckId)
    .select('*')
    .single()

  if (error) {
    console.error('[decks] updateDeckSettings failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not update this tree')
  }
  return ok(toDeck(data))
}

// Owner-only: open or close the tree's Mind Tournament. Opening needs a shared (public) tree:
// visitors can only reach public trees. Closing keeps every participant row, so graduates stay
// engraved and a re-opened tournament continues where it stopped.
export async function setDeckTournament(
  supabase: Client,
  userId: string,
  { deckId, isOpen }: SetTournamentOpenInput,
): Promise<ActionResult<Deck>> {
  const { data: deck, error: readError } = await supabase.from('decks').select('user_id, is_public').eq('id', deckId).maybeSingle()
  if (readError) {
    console.error('[decks] setDeckTournament read failed', readError)
    return fail('INTERNAL_ERROR', 'Could not load this tree')
  }
  if (!deck) return fail('DECK_NOT_FOUND', 'Deck not found')
  if (deck.user_id !== userId) return fail('AUTH_FORBIDDEN', "Only the tree's owner can host its tournament")
  if (isOpen && !deck.is_public) return fail('VALIDATION_FAILED', 'Share the tree with the community first, so visitors can join')

  const { data, error } = await supabase.from('decks').update({ is_tournament_open: isOpen }).eq('id', deckId).select('*').single()
  if (error) {
    // 42703 / PGRST204: the column is missing (run 20260928000900_mind_tournament.sql).
    console.error('[decks] setDeckTournament failed', error.code, error.message)
    return fail('INTERNAL_ERROR', isOpen ? 'Could not open the tournament' : 'Could not close the tournament')
  }
  return ok(toDeck(data))
}

// Uproot a whole tree. The database cascades the rest (decks → mindmap_nodes → knowledge_items →
// user_progress, all ON DELETE CASCADE, see DATABASE.md), so one DELETE removes every root,
// statement and everyone's progress on them in a single statement. RLS "decks: delete own" is the
// final guard; the owner check gives AUTH_FORBIDDEN first, and RETURNING catches a silent no-op.
export async function removeDeck(
  supabase: Client,
  userId: string,
  { deckId }: DeleteDeckInput,
): Promise<ActionResult<{ id: string; slug: string; refund: number }>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  // Chop through uproot_deck() (migration 20260930000000): deletes the deck and pays the Woodshop
  // refund (25% of its statements, at most 50 🪙) in one transaction. Before that migration the
  // function doesn't exist: fall back to the plain delete below (no refund).
  const chopped = await supabase.rpc('uproot_deck', { p_deck_id: deckId })
  if (!chopped.error) {
    const row = Array.isArray(chopped.data) ? chopped.data[0] : chopped.data
    return ok({ id: deckId, slug: owner.data.slug, refund: row?.refund ?? 0 })
  }
  if (!['PGRST202', '42883'].includes(chopped.error.code)) {
    console.error('[decks] uproot_deck failed', chopped.error.code, chopped.error.message)
    return fail('INTERNAL_ERROR', 'Could not uproot this tree')
  }
  console.error('[decks] removeDeck: run supabase/migrations/20260930000000_farm_grid.sql (no Woodshop refund until then)')

  const { data, error } = await supabase.from('decks').delete().eq('id', deckId).select('id')
  if (error) {
    console.error('[decks] removeDeck failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not uproot this tree')
  }
  // Zero rows: the delete policy refused it (or the deck vanished in between).
  if (!data || data.length === 0) {
    console.error('[decks] removeDeck deleted no rows (missing "decks: delete own" policy?)', deckId)
    return fail('AUTH_FORBIDDEN', 'This tree could not be uprooted')
  }
  return ok({ id: deckId, slug: owner.data.slug, refund: 0 })
}

// Root's deck, for owner checks on node edits.
async function findNodeDeck(supabase: Client, nodeId: string): Promise<ActionResult<{ deckId: string; title: string }>> {
  const { data, error } = await supabase.from('mindmap_nodes').select('deck_id, title').eq('id', nodeId).maybeSingle()
  if (error) {
    console.error('[decks] findNodeDeck failed', error)
    return fail('INTERNAL_ERROR', 'Could not load the root')
  }
  if (!data) return fail('NODE_NOT_FOUND', 'Root not found')
  return ok({ deckId: data.deck_id, title: data.title })
}

export async function renameMindmapNode(
  supabase: Client,
  userId: string,
  { nodeId, title }: UpdateMindmapNodeInput,
): Promise<ActionResult<{ id: string; title: string }>> {
  const node = await findNodeDeck(supabase, nodeId)
  if (!node.success) return node
  const owner = await checkDeckOwner(supabase, node.data.deckId, userId)
  if (!owner.success) return owner

  const { data, error } = await supabase.from('mindmap_nodes').update({ title }).eq('id', nodeId).select('id, title').single()
  if (error) {
    console.error('[decks] renameMindmapNode failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not rename the root')
  }
  return ok(data)
}

// Only empty roots (no statements, no sub-roots) can be deleted, so nothing is lost by accident.
export async function removeMindmapNode(
  supabase: Client,
  userId: string,
  { nodeId }: DeleteMindmapNodeInput,
): Promise<ActionResult<{ id: string }>> {
  const node = await findNodeDeck(supabase, nodeId)
  if (!node.success) return node
  const owner = await checkDeckOwner(supabase, node.data.deckId, userId)
  if (!owner.success) return owner

  const [children, items] = await Promise.all([
    supabase.from('mindmap_nodes').select('id', { count: 'exact', head: true }).eq('parent_id', nodeId),
    supabase.from('knowledge_items').select('id', { count: 'exact', head: true }).eq('node_id', nodeId),
  ])
  if (children.error || items.error) {
    console.error('[decks] removeMindmapNode count failed', children.error ?? items.error)
    return fail('INTERNAL_ERROR', 'Could not delete the root')
  }
  if ((children.count ?? 0) > 0 || (items.count ?? 0) > 0) {
    return fail('NODE_NOT_EMPTY', 'Remove its statements and sub-roots first')
  }

  const { error } = await supabase.from('mindmap_nodes').delete().eq('id', nodeId)
  if (error) {
    console.error('[decks] removeMindmapNode failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not delete the root')
  }
  return ok({ id: nodeId })
}

// Removing a statement also removes everyone's progress on it: user_progress and the Mind
// Tournament's deck_tournament_item_progress reference it with ON DELETE CASCADE (foreign-key
// cascades run regardless of RLS). Owner only; the statement must be in `deckId`.
export async function removeKnowledgeItem(
  supabase: Client,
  userId: string,
  { deckId, itemId }: DeleteKnowledgeItemInput,
): Promise<ActionResult<{ id: string; slug: string }>> {
  const { data: item, error: itemError } = await supabase.from('knowledge_items').select('id, node_id').eq('id', itemId).maybeSingle()
  if (itemError) {
    console.error('[decks] removeKnowledgeItem lookup failed', itemError)
    return fail('INTERNAL_ERROR', 'Could not remove the statement')
  }
  if (!item) return fail('ITEM_NOT_FOUND', 'Statement not found')

  const node = await findNodeDeck(supabase, item.node_id)
  if (!node.success) return node
  if (node.data.deckId !== deckId) return fail('ITEM_NOT_FOUND', 'Statement not found in this tree')
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  // RETURNING id: 0 rows means RLS refused the delete (not the owner after all).
  const { data, error } = await supabase.from('knowledge_items').delete().eq('id', itemId).select('id')
  if (error) {
    console.error('[decks] removeKnowledgeItem failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not remove the statement')
  }
  if (!data || data.length === 0) return fail('AUTH_FORBIDDEN', 'Only the owner can delete statements')
  return ok({ id: itemId, slug: owner.data.slug })
}

// Edits a statement's text (correct_stmt). Owner only; the statement must be in `deckId`. The
// trap rules stay { negate: true } style defaults, so traps are rebuilt from the new text on the
// next round. Players' progress on the statement is kept. Returns whether it is drillable with its
// root's other statements as siblings (answers.ts, authorized by the owner check).
export async function editKnowledgeItem(
  supabase: Client,
  userId: string,
  { deckId, itemId, text }: UpdateKnowledgeItemInput,
): Promise<ActionResult<{ id: string; statement: string; drillable: boolean; slug: string }>> {
  const { data: item, error: itemError } = await supabase.from('knowledge_items').select('id, node_id').eq('id', itemId).maybeSingle()
  if (itemError) {
    console.error('[decks] editKnowledgeItem lookup failed', itemError)
    return fail('INTERNAL_ERROR', 'Could not update the statement')
  }
  if (!item) return fail('ITEM_NOT_FOUND', 'Statement not found')

  const node = await findNodeDeck(supabase, item.node_id)
  if (!node.success) return node
  if (node.data.deckId !== deckId) return fail('ITEM_NOT_FOUND', 'Statement not found in this tree')
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  // RETURNING only id: writing correct_stmt is allowed, reading it back is not. 0 rows = RLS refused.
  const { data, error } = await supabase.from('knowledge_items').update({ correct_stmt: text }).eq('id', itemId).select('id')
  if (error) {
    console.error('[decks] editKnowledgeItem failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not update the statement')
  }
  if (!data || data.length === 0) return fail('AUTH_FORBIDDEN', 'Only the owner can edit statements')

  const siblings = await readAnswersForNodes(supabase, [item.node_id])
  const others = siblings.success ? siblings.data.filter((s) => s.itemId !== itemId).map((s) => s.correctStmt) : []
  return ok({ id: itemId, statement: text, drillable: isDrillable(text, DEFAULT_TRAP_RULES, others), slug: owner.data.slug })
}

export type RemovedBranch = { rootId: string; slug: string; deletedStatements: number; deletedSubRoots: number }

// Deletes a whole root branch: ONE delete of the root row, and the database cascades the rest
// (sub-roots via the self-referencing FK, their knowledge_items, and everyone's user_progress and
// deck_tournament_item_progress on those items). Owner only; the root must be in `deckId`. The
// counts are taken first, for the confirmation / result message.
export async function removeRootBranch(
  supabase: Client,
  userId: string,
  { deckId, rootId }: DeleteRootBranchInput,
): Promise<ActionResult<RemovedBranch>> {
  const node = await findNodeDeck(supabase, rootId)
  if (!node.success) return node
  if (node.data.deckId !== deckId) return fail('NODE_NOT_FOUND', 'Root not found in this tree')
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  const { data: nodes, error: nodesError } = await supabase.from('mindmap_nodes').select('id, parent_id').eq('deck_id', deckId)
  if (nodesError) {
    console.error('[decks] removeRootBranch nodes failed', nodesError)
    return fail('INTERNAL_ERROR', 'Could not delete the root')
  }
  const branch = branchNodeIds(
    nodes.map((n) => ({ id: n.id, parentId: n.parent_id })),
    rootId,
  )
  const { count, error: countError } = await supabase
    .from('knowledge_items')
    .select('id', { count: 'exact', head: true })
    .in('node_id', [...branch])
  if (countError) {
    console.error('[decks] removeRootBranch count failed', countError)
    return fail('INTERNAL_ERROR', 'Could not delete the root')
  }

  const { data, error } = await supabase.from('mindmap_nodes').delete().eq('id', rootId).select('id')
  if (error) {
    console.error('[decks] removeRootBranch failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not delete the root')
  }
  if (!data || data.length === 0) return fail('AUTH_FORBIDDEN', 'Only the owner can delete roots')
  return ok({ rootId, slug: owner.data.slug, deletedStatements: count ?? 0, deletedSubRoots: branch.size - 1 })
}
