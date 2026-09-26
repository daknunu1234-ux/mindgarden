import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Tables } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { GetDecksInput } from '../dto/GetDecksDto'
import type { Deck } from '../types'

const toDeck = (row: Tables<'decks'>): Deck => ({
  id: row.id,
  userId: row.user_id,
  title: row.title,
  slug: row.slug,
  description: row.description,
  isPublic: row.is_public,
  treeType: row.tree_type,
  createdAt: row.created_at,
})

// RLS limits the rows to public decks plus the caller's own decks.
export async function listDecks(
  supabase: SupabaseClient<Database>,
  { limit, page }: GetDecksInput,
): Promise<ActionResult<Deck[]>> {
  const from = (page - 1) * limit
  const { data, error, count } = await supabase
    .from('decks')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1)

  if (error) {
    console.error('[decks] listDecks failed', error)
    return fail('INTERNAL_ERROR', 'Could not load decks')
  }

  return ok(data.map(toDeck), { page, limit, total: count ?? 0 })
}
