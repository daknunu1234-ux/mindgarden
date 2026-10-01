import { z } from 'zod'

// One pick in a tournament round. Like progress's DrillSubmissionDto (the server re-runs the trap
// engine; the client never says whether it was right), plus the tournament tree.
export const SubmitTournamentAnswerDto = z.object({
  deckId: z.uuid('Invalid tree'),
  itemId: z.uuid('Invalid item id'),
  seed: z.string().regex(/^[0-9a-z]{1,16}$/, 'Invalid seed'),
  tag: z.enum(['A', 'B', 'C', 'D']),
  // Browser IANA timezone: practice days are the contestant's local calendar days.
  timeZone: z.string().trim().max(64).optional(),
})

export const GetTournamentBoardsDto = z.object({
  deckId: z.uuid('Invalid tree'),
})

export type SubmitTournamentAnswerInput = z.infer<typeof SubmitTournamentAnswerDto>
export type GetTournamentBoardsInput = z.infer<typeof GetTournamentBoardsDto>
