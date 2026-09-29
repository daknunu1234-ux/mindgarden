import { z } from 'zod'

// Owner switch "🏆 Host Mind Tournament" on the Tree Workshop.
export const SetTournamentOpenDto = z.object({
  deckId: z.uuid('Invalid deck id'),
  isOpen: z.boolean(),
})

export type SetTournamentOpenInput = z.infer<typeof SetTournamentOpenDto>
