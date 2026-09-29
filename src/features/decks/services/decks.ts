import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { GetDeckBySlugInput } from '../dto/GetDeckBySlugDto'
import type { GetDecksInput, GetNeighborGardenInput } from '../dto/GetDecksDto'
import { buildDeckTree } from '../lib/deckTree'
import type { Deck, DeckDetail } from '../types'

export const toDeck = (row: Tables<'decks'>): Deck => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  slug: row.slug,
  description: row.description,
  isPublic: row.is_public,
  treeType: row.tree_type,
  createdAt: row.created_at,
  // Before migration 20260928000900 the column doesn't exist: no tournament.
  isTournamentOpen: row.is_tournament_open ?? false,
})

// The player's own garden: ONLY decks they own (user_id = the session user), public or private.
// RLS would also return everyone's public decks, so the owner filter is explicit here.
export async function listDecks(
  supabase: SupabaseClient<Database>,
  userId: string,
  { limit, page }: GetDecksInput,
): Promise<ActionResult<Deck[]>> {
  const from = (page - 1) * limit
  const { data, error, count } = await supabase
    .from('decks')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (error) {
    console.error('[decks] listDecks failed', error)
    return fail('INTERNAL_ERROR', 'Could not load decks')
  }

  return ok(data.map(toDeck), { page, limit, total: count ?? 0 })
}

// One neighbour's island when visiting: their public trees only.
export async function listNeighborDecks(
  supabase: SupabaseClient<Database>,
  { ownerId, limit }: GetNeighborGardenInput,
): Promise<ActionResult<Deck[]>> {
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', ownerId)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('[decks] listNeighborDecks failed', error)
    return fail('INTERNAL_ERROR', 'Could not load this garden')
  }
  return ok(data.map(toDeck))
}

// RLS hides private decks the caller doesn't own, so "not readable" also lands on DECK_NOT_FOUND.
export async function findDeckBySlug(
  supabase: SupabaseClient<Database>,
  { slug }: GetDeckBySlugInput,
): Promise<ActionResult<DeckDetail>> {
  const { data: deck, error: deckError } = await supabase
    .from('decks')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (deckError) {
    console.error('[decks] findDeckBySlug: deck query failed', deckError)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }
  if (!deck) return fail('DECK_NOT_FOUND', 'Deck not found')

  // Only id + prompt: correct_stmt and trap_rules never leave the server here.
  const { data: nodes, error: nodesError } = await supabase
    .from('mindmap_nodes')
    .select('id, parent_id, title, sort_order, knowledge_items(id, prompt, created_at)')
    .eq('deck_id', deck.id)

  if (nodesError) {
    console.error('[decks] findDeckBySlug: nodes query failed', nodesError)
    return fail('INTERNAL_ERROR', 'Could not load deck')
  }

  const tree = buildDeckTree(
    nodes.map((n) => ({
      id: n.id,
      parentId: n.parent_id,
      title: n.title,
      sortOrder: n.sort_order,
      items: [...n.knowledge_items]
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map(({ id, prompt }) => ({ id, prompt })),
    })),
  )

  return ok({ deck: toDeck(deck), tree })
}
