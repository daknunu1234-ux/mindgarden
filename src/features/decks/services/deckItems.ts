import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'

export type DeckItemIds = { deckId: string; items: { itemId: string; nodeId: string }[] }

// Item ids per deck, in the order the ids were given. Decks the caller can't read (RLS)
// or that have no nodes come back with an empty list.
export async function listDeckItemIds(
  supabase: SupabaseClient<Database>,
  deckIds: string[],
): Promise<ActionResult<DeckItemIds[]>> {
  const { data, error } = await supabase
    .from('mindmap_nodes')
    .select('id, deck_id, knowledge_items(id)')
    .in('deck_id', deckIds)

  if (error) {
    console.error('[decks] listDeckItemIds failed', error)
    return fail('INTERNAL_ERROR', 'Could not load deck items')
  }

  const byDeck = new Map<string, DeckItemIds['items']>(deckIds.map((id) => [id, []]))
  for (const node of data) {
    const items = byDeck.get(node.deck_id)
    items?.push(...node.knowledge_items.map((item) => ({ itemId: item.id, nodeId: node.id })))
  }
  return ok(deckIds.map((deckId) => ({ deckId, items: byDeck.get(deckId) ?? [] })))
}
