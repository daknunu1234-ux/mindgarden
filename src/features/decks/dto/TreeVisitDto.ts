import { z } from 'zod'

// Opening someone else's shared tree on /deck/[slug] (TreeVisitTracker).
export const RecordTreeVisitDto = z.object({
  deckId: z.uuid('Invalid tree'),
})

// The Visited Gardens drawer: my most recent visits.
export const GetVisitedGardensDto = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type RecordTreeVisitInput = z.infer<typeof RecordTreeVisitDto>
export type GetVisitedGardensInput = z.infer<typeof GetVisitedGardensDto>
