import { z } from 'zod'

// Clone another gardener's shared tree. Only the source id: the cloner comes from the session.
export const CloneDeckDto = z.object({ deckId: z.uuid('Invalid tree') })

export type CloneDeckInput = z.infer<typeof CloneDeckDto>
