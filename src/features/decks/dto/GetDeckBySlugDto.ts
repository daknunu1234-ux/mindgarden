import { z } from 'zod'

// Slug rules from DATABASE.md: kebab-case, max 160 chars.
export const GetDeckBySlugDto = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(160, 'Slug is too long')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
})

export type GetDeckBySlugInput = z.infer<typeof GetDeckBySlugDto>
