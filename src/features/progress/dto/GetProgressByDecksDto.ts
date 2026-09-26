import { z } from 'zod'

// 1–50 deck ids (API SPEC.md §6); duplicates are removed.
export const GetProgressByDecksDto = z.object({
  deckIds: z
    .array(z.uuid('Invalid deck id'))
    .min(1, 'At least one deck id is required')
    .max(50, 'At most 50 decks at a time')
    .transform((ids) => [...new Set(ids)]),
})

export type GetProgressByDecksInput = z.infer<typeof GetProgressByDecksDto>
