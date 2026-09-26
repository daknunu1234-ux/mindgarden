import { z } from 'zod'

export const CreateMindmapNodeDto = z.object({
  deckId: z.uuid('Invalid deck id'),
  title: z.string().trim().min(1, 'Name the root').max(150, 'Root name is too long'),
  // Omitted or null → a top-level root.
  parentId: z.uuid('Invalid parent root').nullish().transform((v) => v ?? null),
})

export type CreateMindmapNodeInput = z.infer<typeof CreateMindmapNodeDto>
