import { z } from 'zod'

const limit = z.coerce.number().int().min(1).max(50).default(20)

// Either a deck id or a slug (same slug rules as decks/dto/GetDeckBySlugDto).
export const GetDrillSessionDto = z.union([
  z.object({ deckId: z.uuid('Invalid deck id'), limit }),
  z.object({
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required')
      .max(160, 'Slug is too long')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
    limit,
  }),
])

export type GetDrillSessionInput = z.infer<typeof GetDrillSessionDto>
