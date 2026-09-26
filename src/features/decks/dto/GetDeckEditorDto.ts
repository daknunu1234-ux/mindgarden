import { z } from 'zod'

export const GetDeckEditorDto = z.object({ deckId: z.uuid('Invalid deck id') })
