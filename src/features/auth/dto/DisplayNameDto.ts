import { z } from 'zod'
import { DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, displayNameLength, sanitizeDisplayName } from '../lib/displayName'

// "Garden Name": sanitized first (trim, single spaces, no tags or invisible characters), then 2–30.
export const UpdateDisplayNameDto = z.object({
  displayName: z
    .string('Enter a garden name')
    .max(200, 'That name is too long')
    .transform(sanitizeDisplayName)
    .refine((name) => displayNameLength(name) >= DISPLAY_NAME_MIN, `Use at least ${DISPLAY_NAME_MIN} characters`)
    .refine((name) => displayNameLength(name) <= DISPLAY_NAME_MAX, `Use at most ${DISPLAY_NAME_MAX} characters`),
})

// Chosen names for a list of gardeners (boards, Visited Gardens, the visitor banner).
export const GetDisplayNamesDto = z.object({
  userIds: z.array(z.uuid('Invalid gardener')).max(200, 'Too many gardeners'),
})

export type UpdateDisplayNameInput = z.infer<typeof UpdateDisplayNameDto>
export type GetDisplayNamesInput = z.infer<typeof GetDisplayNamesDto>
