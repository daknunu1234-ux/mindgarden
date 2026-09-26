import { z } from 'zod'

// Coerce so `?page=2` from the URL works as well as a number.
export const GetDecksDto = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  page: z.coerce.number().int().min(1).default(1),
})

export type GetDecksInput = z.infer<typeof GetDecksDto>
