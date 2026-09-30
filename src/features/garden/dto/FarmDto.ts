import { z } from 'zod'
import { GRID_SIZE } from '../lib/farmGrid'

const tile = z.coerce.number().int('Pick a tile').min(0, 'That tile is off the farm').max(GRID_SIZE - 1, 'That tile is off the farm')

// Whose farm: yours (no ownerId) or a neighbour's (visitor mode, their public trees only).
export const GetFarmPlacementsDto = z.object({ ownerId: z.uuid('Invalid gardener').optional() })

// Plant one of your trees (free) or buy a shop item, at its top tile. Price and size are the
// database's business (purchase_and_place_item): the client only says what and where.
export const PlaceFarmItemDto = z.discriminatedUnion('item', [
  z.object({ item: z.literal('tree'), deckId: z.uuid('Invalid tree'), x: tile, y: tile }),
  z.object({ item: z.enum(['farmer_house', 'woodshop', 'stream', 'fence', 'rockery', 'cow', 'pig']), x: tile, y: tile }),
])

// Pick an item up again (a tree goes back to the Shop's Trees tab). No refund.
export const RemoveFarmPlacementDto = z.object({ placementId: z.uuid('Invalid item') })

// Move one of your trees or items to a new top tile (its footprint stays the same).
export const MoveFarmPlacementDto = z.object({ placementId: z.uuid('Invalid item'), x: tile, y: tile })

export type MoveFarmPlacementInput = z.infer<typeof MoveFarmPlacementDto>
export type PlaceFarmItemInput = z.infer<typeof PlaceFarmItemDto>
export type RemoveFarmPlacementInput = z.infer<typeof RemoveFarmPlacementDto>
