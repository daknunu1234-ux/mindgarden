import { z } from 'zod'

// Coerce so `?page=2` from the URL works as well as a number.
export const GetDecksDto = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
})

// Visiting one neighbour's island (?visit=<ownerId> on the farm).
export const GetNeighborGardenDto = z.object({
  ownerId: z.uuid('Invalid gardener'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type GetDecksInput = z.infer<typeof GetDecksDto>
export type GetNeighborGardenInput = z.infer<typeof GetNeighborGardenDto>
