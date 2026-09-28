import { z } from 'zod'

// The player's pick. Correctness is decided on the server by re-running the trap engine,
// so there is no isCorrect field and no userId (taken from the session).
export const DrillSubmissionDto = z.object({
  itemId: z.uuid('Invalid item id'),
  seed: z.string().regex(/^[0-9a-z]{1,16}$/, 'Invalid seed'),
  tag: z.enum(['A', 'B', 'C']),
  // Browser IANA timezone for the streak's calendar day; validated again on the server.
  timeZone: z.string().trim().max(64).optional(),
})

export type DrillSubmission = z.infer<typeof DrillSubmissionDto>
