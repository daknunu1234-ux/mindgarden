import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/shared/types/database.types'
import { fail, ok, type ActionResult } from '@/shared/types/result'
import type { PlaceFarmItemInput, RemoveFarmPlacementInput } from '../dto/FarmDto'
import { catalogItem } from '../lib/farmCatalog'
import type { Placement } from '../lib/farmGrid'

type Client = SupabaseClient<Database>
const MISSING = new Set(['42P01', 'PGRST205', 'PGRST202', '42883'])
const MIGRATION = 'supabase/migrations/20260930000000_farm_grid.sql'

// A farm's placements. RLS shows your own farm in full; on someone else's farm only the items and
// their PUBLIC trees. Before the migration the table doesn't exist: an empty farm (logged).
export async function listPlacements(supabase: Client, ownerId: string): Promise<ActionResult<Placement[]>> {
  const { data, error } = await supabase
    .from('garden_placements')
    .select('id, item_type, deck_id, grid_x, grid_y, width, height, variant')
    .eq('user_id', ownerId)
  if (error) {
    if (MISSING.has(error.code)) {
      console.error(`[garden] listPlacements: run ${MIGRATION}`)
      return ok([])
    }
    console.error('[garden] listPlacements failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not load the farm')
  }
  return ok(
    data.map((r) => ({ id: r.id, itemType: r.item_type, deckId: r.deck_id, x: r.grid_x, y: r.grid_y, width: r.width, height: r.height, variant: r.variant })),
  )
}

export type PlacedItem = { placementId: string; remainingCoins: number; cost: number }

// Plants a tree (free) or buys a shop item, through purchase_and_place_item(): it charges the
// catalogue price and inserts in one transaction, refusing overlaps and off-grid tiles.
export async function placeItem(supabase: Client, input: PlaceFarmItemInput): Promise<ActionResult<PlacedItem>> {
  const entry = input.item === 'tree' ? null : catalogItem(input.item)
  const { data, error } = await supabase.rpc('purchase_and_place_item', {
    p_item_type: input.item === 'tree' ? 'tree' : entry!.itemType,
    p_x: input.x,
    p_y: input.y,
    p_deck_id: input.item === 'tree' ? input.deckId : null,
    p_variant: entry?.variant ?? null,
  })
  if (error) {
    const message = error.message ?? ''
    if (message.includes('INSUFFICIENT_COINS')) {
      return fail('INSUFFICIENT_COINS', `You need ${entry?.price ?? 0} coins for the ${entry?.name ?? 'item'}!`)
    }
    if (message.includes('TILE_UNAVAILABLE')) return fail('TILE_UNAVAILABLE', 'That spot is taken or off the farm')
    if (message.includes('TREE_ALREADY_PLACED')) return fail('TILE_UNAVAILABLE', 'This tree is already on your farm')
    if (message.includes('DECK_NOT_FOUND')) return fail('DECK_NOT_FOUND', 'Tree not found')
    if (message.includes('AUTH_UNAUTHORIZED')) return fail('AUTH_UNAUTHORIZED', 'Sign in to build your farm')
    if (MISSING.has(error.code)) console.error(`[garden] placeItem: run ${MIGRATION}`)
    else console.error('[garden] placeItem failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not place that on the farm')
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return fail('INTERNAL_ERROR', 'Could not place that on the farm')
  return ok({ placementId: row.placement_id, remainingCoins: row.remaining_coins, cost: row.cost })
}

// Picks an item up (RLS "delete own"; 0 rows = not yours). A tree goes back to the Trees tab.
export async function removePlacement(supabase: Client, userId: string, { placementId }: RemoveFarmPlacementInput): Promise<ActionResult<{ id: string }>> {
  const { data, error } = await supabase.from('garden_placements').delete().eq('id', placementId).eq('user_id', userId).select('id')
  if (error) {
    console.error('[garden] removePlacement failed', error.code, error.message)
    return fail('INTERNAL_ERROR', 'Could not pick that up')
  }
  if (!data || data.length === 0) return fail('AUTH_FORBIDDEN', 'That is not on your farm')
  return ok({ id: placementId })
}
