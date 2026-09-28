import { z } from 'zod'
import { TREE_TYPE_IDS } from '@/shared/lib/treeSkins'

// Owner edits of a deck's settings. The slug never changes (links stay stable).
export const UpdateDeckDto = z
  .object({
    deckId: z.uuid('Invalid deck id'),
    title: z.string().trim().min(1, 'Give your tree a name').max(150, 'Title is too long').optional(),
    description: z
      .string()
      .trim()
      .max(1000, 'Description is too long')
      .nullish()
      .transform((v) => (v === undefined ? undefined : v || null)),
    treeType: z.enum(TREE_TYPE_IDS).optional(),
    isPublic: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.description !== undefined || v.treeType !== undefined || v.isPublic !== undefined, {
    message: 'Nothing to update',
  })

export type UpdateDeckInput = z.infer<typeof UpdateDeckDto>
