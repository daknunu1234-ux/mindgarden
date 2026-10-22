import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { CreateKnowledgeItemInput } from '../dto/CreateKnowledgeItemDto'
import type { CreateKnowledgeItemsInput } from '../dto/CreateKnowledgeItemsDto'
import type { CreateMindmapNodeInput } from '../dto/CreateMindmapNodeDto'
import type {
  CreateContentNodeInput,
  DeleteKnowledgeItemInput,
  DeleteMindmapNodeInput,
  DeleteRootBranchInput,
  IndentContentNodeInput,
  MoveKnowledgeItemInput,
  ToggleNodeTypeInput,
  UpdateKnowledgeItemInput,
  UpdateMindmapNodeInput,
} from '../dto/ManageRootsDto'
import { branchCounts, outlineRows, toEditorNodes, type StoredNode } from '../lib/contentTree'
import { DEFAULT_TRAP_RULES, isDrillable } from '../lib/drillable'
import { checkDeckOwner } from './authoring'
import type { ContentRow, DeckEditor, NodeType } from '../types'

// A tree's outline, read and edited in public.content_nodes (migration 20261013000000): roots and
// statements in one hierarchy. Every write is the owner's (checkDeckOwner first for a clear error;
// RLS "content: … if deck owner" is the final guard). The database keeps the shape: a top-level node
// is a root, no node under its own branch, a parent in the same tree, statements in plain text.

type Client = SupabaseClient<Database>
const FK_VIOLATION = '23503'
const CHECK_VIOLATION = '23514'
const NODE_COLUMNS = 'id, deck_id, parent_id, node_type, content, sort_order, created_at'

type NodeRow = { id: string; deck_id: string; parent_id: string | null; node_type: NodeType; content: string; sort_order: number; created_at: string }

const toStored = (r: NodeRow): StoredNode => ({ id: r.id, parentId: r.parent_id, type: r.node_type, content: r.content, sortOrder: r.sort_order, createdAt: r.created_at })

// The database's refusals → action errors.
function nodeError(error: { code?: string; message?: string }, what: string): ActionResult<never> {
  const message = error.message ?? ''
  if (message.includes('TOP_LEVEL_STATEMENT')) return fail('VALIDATION_FAILED', 'A top-level node is a root')
  if (message.includes('NODE_CYCLE')) return fail('VALIDATION_FAILED', 'A node cannot go under its own branch')
  if (error.code === FK_VIOLATION) return fail('NODE_NOT_FOUND', 'Its parent is not in this tree')
  if (error.code === CHECK_VIOLATION) {
    return message.includes('plain_statement') ? fail('VALIDATION_FAILED', 'Use plain text, not LaTeX (no \\commands)') : fail('VALIDATION_FAILED', 'Invalid text')
  }
  console.error(`[decks] ${what} failed`, error.code, message)
  return fail('INTERNAL_ERROR', `Could not ${what}`)
}

// One node (any tree the caller can read; RLS). Null when missing or unreadable.
async function findNode(supabase: Client, id: string): Promise<ActionResult<NodeRow | null>> {
  const { data, error } = await supabase.from('content_nodes').select(NODE_COLUMNS).eq('id', id).maybeSingle()
  if (error) {
    console.error('[decks] findNode failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load the tree')
  }
  return ok(data as NodeRow | null)
}

// ─── Reads ──────────────────────────────────────────────────────────────────────────────────────

// The tree's outline in display order (a node, then its branch). Callers authorize the deck.
export async function loadOutline(supabase: Client, deckId: string): Promise<ActionResult<ContentRow[]>> {
  const { data, error } = await supabase.from('content_nodes').select(NODE_COLUMNS).eq('deck_id', deckId)
  if (error) {
    console.error('[decks] loadOutline failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load the tree')
  }
  return ok(outlineRows((data as NodeRow[]).map(toStored)))
}

async function deckView(supabase: Client, deckId: string, treeType: string): Promise<ActionResult<DeckEditor>> {
  const rows = await loadOutline(supabase, deckId)
  if (!rows.success) return rows
  return ok({ deckId, treeType, nodes: toEditorNodes(rows.data), rows: rows.data })
}

// The owner's view: the whole outline (rows) and the same as roots with their statements (nodes).
export async function loadDeckEditor(supabase: Client, userId: string, deckId: string): Promise<ActionResult<DeckEditor>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner
  return deckView(supabase, deckId, owner.data.treeType)
}

// Read-only visitor view (strict visitor mode): the same, for a tree that is PUBLIC or the viewer's
// own. Visitors can read everything but can't practise it (FORBIDDEN_VISITOR_PRACTICE). Private trees
// of others stay DECK_NOT_FOUND (RLS hides them; is_public re-checked here too).
export async function loadDeckReader(supabase: Client, userId: string | null, deckId: string): Promise<ActionResult<DeckEditor>> {
  const { data, error } = await supabase.from('decks').select('user_id, is_public, tree_type').eq('id', deckId).maybeSingle()
  if (error) {
    console.error('[decks] loadDeckReader failed', error)
    return fail('INTERNAL_ERROR', 'Could not load this tree')
  }
  if (!data || !(data.is_public || data.user_id === userId)) return fail('DECK_NOT_FOUND', 'Deck not found')
  return deckView(supabase, deckId, data.tree_type)
}

// ─── Order among siblings ───────────────────────────────────────────────────────────────────────

// sort_order for a new child of `parentId`: right after sibling `afterId` (the midpoint with the
// next sibling), else before the first one when `first`, else after the last one. Roots and
// statements share one order.
async function orderFor(supabase: Client, deckId: string, parentId: string | null, afterId?: string | null, first = false): Promise<ActionResult<number>> {
  let q = supabase.from('content_nodes').select('id, sort_order').eq('deck_id', deckId)
  q = parentId ? q.eq('parent_id', parentId) : q.is('parent_id', null)
  const { data, error } = await q
  if (error) {
    console.error('[decks] orderFor failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not place the node')
  }
  const orders = (data as { id: string; sort_order: number }[]).map((r) => r.sort_order).sort((a, b) => a - b)
  const anchor = afterId ? (data as { id: string; sort_order: number }[]).find((r) => r.id === afterId) : undefined
  if (!anchor && first) return ok(orders.length > 0 ? orders[0] - 1 : 1)
  if (!anchor) return ok(orders.length > 0 ? orders[orders.length - 1] + 1 : 1)
  const next = orders.find((o) => o > anchor.sort_order)
  return ok(next === undefined ? anchor.sort_order + 1 : anchor.sort_order + (next - anchor.sort_order) / 2)
}

// ─── Writes ─────────────────────────────────────────────────────────────────────────────────────

export type CreatedNode = { id: string; drillable: boolean; slug: string }

// One new root or statement under `parentId` (null = a top-level root), right after sibling `afterId`
// (else first when `first`, else last). The Tree Workshop's lines, and undone deletes.
export async function createNode(
  supabase: Client,
  userId: string,
  { deckId, parentId, type, content, afterId = null, first = false }: CreateContentNodeInput,
): Promise<ActionResult<CreatedNode>> {
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner
  if (parentId) {
    const parent = await findNode(supabase, parentId)
    if (!parent.success) return parent
    if (!parent.data || parent.data.deck_id !== deckId) return fail('NODE_NOT_FOUND', 'Its parent is not in this tree')
  }
  const order = await orderFor(supabase, deckId, parentId, afterId, first)
  if (!order.success) return order
  const { data, error } = await supabase
    .from('content_nodes')
    .insert({ deck_id: deckId, parent_id: parentId, content, node_type: type, trap_rules: type === 'statement' ? DEFAULT_TRAP_RULES : {}, sort_order: order.data })
    .select('id')
    .single()
  if (error) return nodeError(error, type === 'root' ? 'add the root' : 'add the statement')
  return ok({ id: data.id, drillable: type === 'statement' && isDrillable(content), slug: owner.data.slug })
}

// createMindmapNode: a root (top-level, or under `parentId`), last among its siblings.
export async function insertMindmapNode(supabase: Client, userId: string, { deckId, title, parentId }: CreateMindmapNodeInput): Promise<ActionResult<{ id: string; title: string }>> {
  const res = await createNode(supabase, userId, { deckId, parentId, type: 'root', content: title })
  return res.success ? ok({ id: res.data.id, title }) : res
}

// createKnowledgeItem: a statement under root `nodeId`, or under statement `parentItemId`; right
// after `afterItemId` when that is a sibling, else last.
export async function insertKnowledgeItem(
  supabase: Client,
  userId: string,
  { nodeId, statement, parentItemId = null, afterItemId = null }: CreateKnowledgeItemInput,
): Promise<ActionResult<{ id: string; drillable: boolean }>> {
  const parent = await findNode(supabase, parentItemId ?? nodeId)
  if (!parent.success) return parent
  if (!parent.data) return parentItemId ? fail('ITEM_NOT_FOUND', 'The statement to nest under is not in this tree') : fail('NODE_NOT_FOUND', 'Root not found')
  const res = await createNode(supabase, userId, { deckId: parent.data.deck_id, parentId: parent.data.id, type: 'statement', content: statement, afterId: afterItemId })
  return res.success ? ok({ id: res.data.id, drillable: res.data.drillable }) : res
}

export type BulkInsertResult = {
  slug: string
  created: { id: string; statement: string; drillable: boolean }[]
  // Statements already right under that node (skipped, not duplicated).
  skipped: number
}

// Bulk import ("📋 Bulk Add via Notes / Bullets"): many statements under one node of the tree, in ONE
// insert, after its current children. Statements already right under it are skipped.
export async function insertKnowledgeItems(
  supabase: Client,
  userId: string,
  { deckId, rootId, statements }: CreateKnowledgeItemsInput,
): Promise<ActionResult<BulkInsertResult>> {
  const parent = await findNode(supabase, rootId)
  if (!parent.success) return parent
  if (!parent.data || parent.data.deck_id !== deckId) return fail('NODE_NOT_FOUND', 'Root not found in this tree')
  const owner = await checkDeckOwner(supabase, deckId, userId)
  if (!owner.success) return owner

  const { data: siblings, error: siblingError } = await supabase.from('content_nodes').select('content, node_type, sort_order').eq('parent_id', rootId)
  if (siblingError) {
    console.error('[decks] insertKnowledgeItems lookup failed', siblingError.code, siblingError.message)
    return fail('INTERNAL_ERROR', 'Could not import the statements')
  }
  const rows = siblings as { content: string; node_type: NodeType; sort_order: number }[]
  const already = new Set(rows.filter((r) => r.node_type === 'statement').map((r) => r.content.trim()))
  const fresh = [...new Set(statements)].filter((s) => !already.has(s))
  const skipped = statements.length - fresh.length
  if (fresh.length === 0) return ok({ slug: owner.data.slug, created: [], skipped })

  const base = rows.reduce((max, r) => Math.max(max, r.sort_order), 0)
  const { data, error } = await supabase
    .from('content_nodes')
    .insert(fresh.map((content, i) => ({ deck_id: deckId, parent_id: rootId, content, node_type: 'statement' as const, trap_rules: DEFAULT_TRAP_RULES, sort_order: base + i + 1 })))
    .select('id')
  if (error || !data || data.length !== fresh.length) {
    if (error) return nodeError(error, 'import the statements')
    return fail('INTERNAL_ERROR', 'Could not import the statements')
  }
  return ok({
    slug: owner.data.slug,
    // Rows come back in insert order.
    created: fresh.map((statement, i) => ({ id: data[i].id, statement, drillable: isDrillable(statement) })),
    skipped,
  })
}

// A node of `deckId` (ITEM_NOT_FOUND for a statement, NODE_NOT_FOUND for a root), after the owner check.
async function ownedNode(supabase: Client, userId: string, deckId: string | null, id: string, kind: 'item' | 'node') {
  const node = await findNode(supabase, id)
  if (!node.success) return node
  const missing = kind === 'item' ? fail('ITEM_NOT_FOUND', 'Statement not found in this tree') : fail('NODE_NOT_FOUND', 'Root not found in this tree')
  if (!node.data || (deckId !== null && node.data.deck_id !== deckId)) return missing
  const owner = await checkDeckOwner(supabase, node.data.deck_id, userId)
  if (!owner.success) return owner
  return ok({ node: node.data, slug: owner.data.slug })
}

// One UPDATE with RETURNING id: 0 rows = RLS refused (not the owner after all).
async function updateNode(supabase: Client, id: string, patch: Database['public']['Tables']['content_nodes']['Update'], what: string): Promise<ActionResult<true>> {
  const { data, error } = await supabase.from('content_nodes').update(patch).eq('id', id).select('id')
  if (error) return nodeError(error, what)
  if (!data || data.length === 0) return fail('AUTH_FORBIDDEN', 'Only the owner can change this tree')
  return ok(true)
}

// updateKnowledgeItem: a statement's text (cleaned, 5–500 plain text). Players' progress is kept.
export async function editKnowledgeItem(
  supabase: Client,
  userId: string,
  { deckId, itemId, text }: UpdateKnowledgeItemInput,
): Promise<ActionResult<{ id: string; statement: string; drillable: boolean; slug: string }>> {
  const found = await ownedNode(supabase, userId, deckId, itemId, 'item')
  if (!found.success) return found
  const updated = await updateNode(supabase, itemId, { content: text }, 'update the statement')
  if (!updated.success) return updated
  return ok({ id: itemId, statement: text, drillable: found.data.node.node_type === 'statement' && isDrillable(text), slug: found.data.slug })
}

// updateMindmapNode: a root's title.
export async function renameMindmapNode(supabase: Client, userId: string, { nodeId, title }: UpdateMindmapNodeInput): Promise<ActionResult<{ id: string; title: string }>> {
  const found = await ownedNode(supabase, userId, null, nodeId, 'node')
  if (!found.success) return found
  const updated = await updateNode(supabase, nodeId, { content: title }, 'rename the root')
  if (!updated.success) return updated
  return ok({ id: nodeId, title })
}

export type RemovedBranch = { rootId: string; slug: string; deletedStatements: number; deletedSubRoots: number }

// Deletes a node and its whole branch: ONE delete; the database cascades the branch and everyone's
// progress on its statements. The counts are taken first, for the confirmation / result message.
async function deleteBranch(supabase: Client, node: NodeRow, slug: string): Promise<ActionResult<RemovedBranch>> {
  const outline = await loadOutline(supabase, node.deck_id)
  if (!outline.success) return outline
  const below = branchCounts(outline.data, node.id)
  const { data, error } = await supabase.from('content_nodes').delete().eq('id', node.id).select('id')
  if (error) return nodeError(error, 'delete it')
  if (!data || data.length === 0) return fail('AUTH_FORBIDDEN', 'Only the owner can delete from this tree')
  return ok({ rootId: node.id, slug, deletedStatements: below.statements, deletedSubRoots: below.roots })
}

// deleteKnowledgeItem: a statement, with everything under it.
export async function removeKnowledgeItem(supabase: Client, userId: string, { deckId, itemId }: DeleteKnowledgeItemInput): Promise<ActionResult<{ id: string; slug: string }>> {
  const found = await ownedNode(supabase, userId, deckId, itemId, 'item')
  if (!found.success) return found
  const res = await deleteBranch(supabase, found.data.node, found.data.slug)
  return res.success ? ok({ id: itemId, slug: res.data.slug }) : res
}

// deleteRootBranch: a root and its whole branch.
export async function removeRootBranch(supabase: Client, userId: string, { deckId, rootId }: DeleteRootBranchInput): Promise<ActionResult<RemovedBranch>> {
  const found = await ownedNode(supabase, userId, deckId, rootId, 'node')
  if (!found.success) return found
  return deleteBranch(supabase, found.data.node, found.data.slug)
}

// deleteMindmapNode: only an empty root (nothing under it), so nothing is lost by accident.
export async function removeMindmapNode(supabase: Client, userId: string, { nodeId }: DeleteMindmapNodeInput): Promise<ActionResult<{ id: string }>> {
  const found = await ownedNode(supabase, userId, null, nodeId, 'node')
  if (!found.success) return found
  const { count, error } = await supabase.from('content_nodes').select('id', { count: 'exact', head: true }).eq('parent_id', nodeId)
  if (error) {
    console.error('[decks] removeMindmapNode count failed', error)
    return fail('INTERNAL_ERROR', 'Could not delete the root')
  }
  if ((count ?? 0) > 0) return fail('NODE_NOT_EMPTY', 'Remove its statements and sub-roots first')
  const res = await deleteBranch(supabase, found.data.node, found.data.slug)
  return res.success ? ok({ id: nodeId }) : res
}

export type MovedStatement = { id: string; nodeId: string; subStatements: number; slug: string }

// 📂 Move: a node, with its branch, under a root of the same tree, as its last child. Its progress
// stays (same ids).
export async function moveKnowledgeItem(supabase: Client, userId: string, { deckId, itemId, toNodeId }: MoveKnowledgeItemInput): Promise<ActionResult<MovedStatement>> {
  const found = await ownedNode(supabase, userId, deckId, itemId, 'item')
  if (!found.success) return found
  const target = await findNode(supabase, toNodeId)
  if (!target.success) return target
  if (!target.data || target.data.deck_id !== deckId || target.data.node_type !== 'root') return fail('NODE_NOT_FOUND', 'That root is not in this tree')
  const outline = await loadOutline(supabase, deckId)
  if (!outline.success) return outline
  const below = branchCounts(outline.data, itemId)
  if (found.data.node.parent_id === toNodeId) return ok({ id: itemId, nodeId: toNodeId, subStatements: below.statements, slug: found.data.slug })
  const order = await orderFor(supabase, deckId, toNodeId)
  if (!order.success) return order
  const updated = await updateNode(supabase, itemId, { parent_id: toNodeId, sort_order: order.data }, 'move it')
  if (!updated.success) return updated
  return ok({ id: itemId, nodeId: toNodeId, subStatements: below.statements, slug: found.data.slug })
}

// Alt: root ↔ statement, in place (one UPDATE; a top-level root stays a root). Progress on a
// statement is kept while it is a root and counts again when it is a statement again.
export async function toggleNodeType(supabase: Client, userId: string, { deckId, nodeId }: ToggleNodeTypeInput): Promise<ActionResult<{ id: string; type: NodeType; drillable: boolean }>> {
  const found = await ownedNode(supabase, userId, deckId, nodeId, 'node')
  if (!found.success) return found
  const { node } = found.data
  if (node.parent_id === null) return fail('VALIDATION_FAILED', 'A top-level root stays a root')
  const type: NodeType = node.node_type === 'root' ? 'statement' : 'root'
  const updated = await updateNode(supabase, nodeId, { node_type: type, ...(type === 'statement' && { trap_rules: DEFAULT_TRAP_RULES }) }, 'change its type')
  if (!updated.success) return updated
  return ok({ id: nodeId, type, drillable: type === 'statement' && isDrillable(node.content) })
}

// Tab / Shift+Tab, in place (indent_content_node): only the node and the direction are sent; the
// database finds the row above / the old parent and keeps the outline order.
export async function indentNode(
  supabase: Client,
  userId: string,
  { deckId, nodeId, direction }: IndentContentNodeInput,
): Promise<ActionResult<{ id: string; parentId: string | null; movedChildren: number }>> {
  const found = await ownedNode(supabase, userId, deckId, nodeId, 'node')
  if (!found.success) return found
  const { data, error } = await supabase.rpc('indent_content_node', { p_node_id: nodeId, p_direction: direction })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('NO_ROW_ABOVE')) return fail('VALIDATION_FAILED', 'Nothing above to nest under')
    if (message.includes('ALREADY_TOP')) return fail('VALIDATION_FAILED', 'Already a top-level root')
    if (message.includes('AUTH_FORBIDDEN')) return fail('AUTH_FORBIDDEN', 'Only the owner can change this tree')
    return nodeError(error, 'move it')
  }
  const row = Array.isArray(data) ? data[0] : data
  return ok({ id: nodeId, parentId: row?.parent_id ?? null, movedChildren: row?.moved_children ?? 0 })
}
