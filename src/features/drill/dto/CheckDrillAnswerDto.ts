import { z } from 'zod'

export const CheckDrillAnswerDto = z.object({
  itemId: z.uuid('Invalid item id'),
  seed: z.string().regex(/^[0-9a-z]{1,16}$/, 'Invalid seed'),
  tag: z.enum(['A', 'B', 'C']),
})

export type CheckDrillAnswerInput = z.infer<typeof CheckDrillAnswerDto>
