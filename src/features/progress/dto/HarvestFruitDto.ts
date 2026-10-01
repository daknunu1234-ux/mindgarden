import { z } from 'zod'

// Harvest one tree's fruit. "Today" is computed on the server (server clock + this timezone), never
// sent by the client, so a player can't choose the day.
export const HarvestFruitDto = z.object({
  deckId: z.uuid('Invalid tree id'),
  // Browser IANA timezone; validated again on the server (unknown → UTC).
  timeZone: z.string().trim().max(64).optional(),
})

export type HarvestFruitInput = z.infer<typeof HarvestFruitDto>
