import { z } from 'zod'

const timeZone = z.string().trim().max(64).optional()

export const StartDailyRushDto = z.object({
  deckId: z.uuid('Invalid tree'),
  // Browser IANA timezone: the run belongs to the player's local calendar day.
  timeZone,
})

// One pick. Like every drill submission there is no verdict: the server rebuilds the card and
// grades it. `tag: null` = the player's clock ran out.
export const AnswerDailyRushDto = z.object({
  day: z.iso.date('Invalid run'),
  tag: z.enum(['A', 'B', 'C', 'D']).nullable(),
})

export type StartDailyRushInput = z.infer<typeof StartDailyRushDto>
export type AnswerDailyRushInput = z.infer<typeof AnswerDailyRushDto>
