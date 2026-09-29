import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { GetVisitedGardensInput, RecordTreeVisitInput } from '../dto/TreeVisitDto'
import type { VisitedTree } from '../types'
import { listDeckItemIds } from './deckItems'

type Client = SupabaseClient<Database>

// Saves (or refreshes) the caller's visit through record_tree_visit() (migration
// 20260928000800), which decides in the database whether the visit counts: only another
// gardener's PUBLIC tree does. Players can't write tree_visits directly.
export async function recordVisit(supabase: Client, { deckId }: RecordTreeVisitInput): Promise<ActionResult<{ recorded: boolean }>> {
  const { data, error } = await supabase.rpc('record_tree_visit', { p_deck_id: deckId })
  if (error) {
    if (error.message?.includes('AUTH_UNAUTHORIZED')) return fail('AUTH_UNAUTHORIZED', 'Sign in to keep track of visited gardens')
    if (error.code === 'PGRST202' || error.code === '42883') {
      console.error('[decks] recordVisit: run supabase/migrations/20260928000800_tree_visits.sql')
    } else {
      console.error('[decks] recordVisit failed', error.code, error.message)
    }
    return fail('INTERNAL_ERROR', 'Could not save this visit')
  }
  return ok({ recorded: data === true })
}

// The Visited Gardens drawer: the viewer's visits, newest first, joined with the trees they
// point at. The inner join goes through decks RLS, so a tree that went private again (or was
// deleted) drops out; the explicit filters keep own and private trees out even so.
export async function listVisitedTrees(
  supabase: Client,
  userId: string,
  { limit }: GetVisitedGardensInput,
): Promise<ActionResult<VisitedTree[]>> {
  const { data, error } = await supabase
    .from('tree_visits')
    .select('visited_at, decks!inner(id, user_id, title, slug, tree_type, is_public)')
    .eq('user_id', userId)
    .eq('decks.is_public', true)
    .neq('decks.user_id', userId)
    .order('visited_at', { ascending: false })
    .limit(limit)

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      console.error('[decks] listVisitedTrees: run supabase/migrations/20260928000800_tree_visits.sql')
    } else {
      console.error('[decks] listVisitedTrees failed', error)
    }
    return fail('INTERNAL_ERROR', 'Could not load your visited gardens')
  }

  const visits = data.filter((v) => v.decks && v.decks.is_public && v.decks.user_id !== userId)
  // Statement counts are a nice-to-have: if they can't be read, the drawer still lists the trees.
  const items = await listDeckItemIds(
    supabase,
    visits.map((v) => v.decks.id),
  )
  const counts = new Map(items.success ? items.data.map((d) => [d.deckId, d.items.length]) : [])

  return ok(
    visits.map((v) => ({
      deckId: v.decks.id,
      ownerId: v.decks.user_id,
      title: v.decks.title,
      slug: v.decks.slug,
      treeType: v.decks.tree_type,
      statementCount: counts.get(v.decks.id) ?? null,
      visitedAt: v.visited_at,
    })),
  )
}
