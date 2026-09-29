import { z } from 'zod'

// Uproot (delete) a whole tree. Only the id: the owner comes from the session.
export const DeleteDeckDto = z.object({ deckId: z.uuid('Invalid tree') })

export type DeleteDeckInput = z.infer<typeof DeleteDeckDto>
