import { z } from 'zod'

// Mark some of your notifications read: their ids (the owner comes from the session).
export const MarkNotificationsReadDto = z.object({ ids: z.array(z.uuid('Invalid notification')).min(1).max(50) })

export type MarkNotificationsReadInput = z.infer<typeof MarkNotificationsReadDto>
