import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import { toDeck } from './decks'
import type { Deck } from '../types'

export type DeckItemIds = { deckId: string; items: { itemId: string; nodeId: string }[] }

// Keeps each `.in()` filter well under URL length limits (a UUID is 36 chars).
const ID_CHUNK = 100

// Item ids per deck, in the order the ids were given. Decks the caller can't read (RLS)
// or that have no nodes come back with an empty list.
export async function listDeckItemIds(
  supabase: SupabaseClient<Database>,
  deckIds: string[],
): Promise<ActionResult<DeckItemIds[]>> {
  const byDeck = new Map<string, DeckItemIds['items']>(deckIds.map((id) => [id, []]))

  for (let i = 0; i < deckIds.length; i += ID_CHUNK) {
    const { data, error } = await supabase
      .from('mindmap_nodes')
      .select('id, deck_id, knowledge_items(id)')
      .in('deck_id', deckIds.slice(i, i + ID_CHUNK))

    if (error) {
      console.error('[decks] listDeckItemIds failed', error)
      return fail('INTERNAL_ERROR', 'Could not load deck items')
    }
    for (const node of data) {
      byDeck.get(node.deck_id)?.push(...node.knowledge_items.map((item) => ({ itemId: item.id, nodeId: node.id })))
    }
  }
  return ok(deckIds.map((deckId) => ({ deckId, items: byDeck.get(deckId) ?? [] })))
}

// Every deck owned by the user (public and private), newest first.
export async function listOwnedDecks(supabase: SupabaseClient<Database>, userId: string): Promise<ActionResult<Deck[]>> {
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[decks] listOwnedDecks failed', error)
    return fail('INTERNAL_ERROR', 'Could not load your trees')
  }
  return ok(data.map(toDeck))
}
