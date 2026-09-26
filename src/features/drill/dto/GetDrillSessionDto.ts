import { z } from 'zod'

const limit = z.coerce.number().int().min(1).max(50).default(20)
// Optional: only practice this node and its sub-branches (?nodeId= on the drill page).
const nodeId = z.uuid('Invalid root id').optional()

// Either a deck id or a slug (same slug rules as decks/dto/GetDeckBySlugDto), plus optional nodeId.
export const GetDrillSessionDto = z.union([
  z.object({ deckId: z.uuid('Invalid deck id'), nodeId, limit }),
  z.object({
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required')
      .max(160, 'Slug is too long')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
    nodeId,
    limit,
  }),
])

export type GetDrillSessionInput = z.infer<typeof GetDrillSessionDto>
