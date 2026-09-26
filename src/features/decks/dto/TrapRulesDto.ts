import { z } from 'zod'

// Shape of knowledge_items.trap_rules (DATABASE.md). The DB only checks it is an object.
export const TrapRulesDto = z.object({
  swaps: z
    .array(z.object({ from: z.string().trim().min(1).max(200), to: z.string().trim().min(1).max(200) }))
    .max(50)
    .optional(),
  negate: z.boolean().optional(),
})

export type TrapRulesInput = z.infer<typeof TrapRulesDto>
