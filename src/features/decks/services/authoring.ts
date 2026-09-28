import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { slugify } from '@/shared/utils/slugify'
import type { CreateDeckInput } from '../dto/CreateDeckDto'
import type { CreateKnowledgeItemInput } from '../dto/CreateKnowledgeItemDto'
import type { CreateMindmapNodeInput } from '../dto/CreateMindmapNodeDto'
import type { UpdateDeckInput } from '../dto/UpdateDeckDto'
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

export async function insertDeck(supabase: Client, userId: string, input: CreateDeckInput): Promise<ActionResult<Deck>> {
  for (const slug of slugCandidates(input.title)) {
    const { data, error } = await supabase
      .from('decks')
      .insert({
        user_id: userId,
        title: input.title,
        slug,
        description: input.description,
        is_public: input.isPublic,
        tree_type: input.treeType,
      })
      .select('*')
      .single()

    if (!error) return ok(toDeck(data))
    if (error.code === UNIQUE_VIOLATION) continue

    // 23503 here: the player has no public.users row (handle_new_user trigger missing?).
    console.error('[decks] insertDeck failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not plant this tree')
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

// Owner-only view with the true statements, flattened in tree order for the editor.
export async function loadDeckEditor(supabase: Client, userId: string, deckId: string): Promise<ActionResult<DeckEditor>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  const { data: nodes, error } = await supabase
    .from('mindmap_nodes')
    .select('id, parent_id, title, sort_order')
    .eq('deck_id', deckId)

  if (error) {
    console.error('[decks] loadDeckEditor failed', error)
    return fail('INTERNAL_ERROR', 'Could not load the editor')
  }

  // Statements come from answers.ts (oldest first); the owner check above authorizes the deck.
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

  return ok({ deckId, treeType: owner.data.treeType, nodes: flat })
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
