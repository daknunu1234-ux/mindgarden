import { z } from 'zod'
import { TREE_TYPE_IDS } from '@/shared/lib/treeSkins'

// Species ids come from the shared catalog (shared/lib/treeSkins), so every view knows them.
export const TREE_TYPES = TREE_TYPE_IDS

// The slug is generated from the title on the server (shared/utils/slugify).
export const CreateDeckDto = z.object({
  title: z.string().trim().min(1, 'Give your tree a name').max(150, 'Title is too long'),
  description: z
    .string()
    .trim()
    .max(1000, 'Description is too long')
    .optional()
    .transform((v) => v || null),
  treeType: z.enum(TREE_TYPES).default('oak'),
  // Private until the owner shares it (DB default false, migration 20260928000600).
  isPublic: z.boolean().default(false),
})

export type CreateDeckInput = z.infer<typeof CreateDeckDto>
