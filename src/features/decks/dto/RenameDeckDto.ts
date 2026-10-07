import { z } from 'zod'
import { cleanTreeName, treeNameError } from '@/shared/lib/treeName'

// Renaming a tree (the farm's tree popover, the deck page, the Tree Workshop, the naming prompt after
// a purchase). The name is cleaned like everywhere else (shared/lib/treeName), then 1–100
// characters. The slug never changes, so links to the tree keep working.
export const RenameDeckDto = z.object({
  deckId: z.uuid('Invalid deck id'),
  title: z
    .string()
    .transform(cleanTreeName)
    .superRefine((name, ctx) => {
      const error = treeNameError(name)
      if (error) ctx.addIssue({ code: 'custom', message: error })
    }),
})

export type RenameDeckInput = z.infer<typeof RenameDeckDto>
