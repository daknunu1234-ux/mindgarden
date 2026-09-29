import { z } from 'zod'
import { normalizeDrillSize } from '../lib/drillSize'

// Round size: 5, 10 or 20 questions (?limit= / the saved choice). Anything else, or nothing, means 10:
// a bad size never blocks practice.
const limit = z.unknown().optional().transform((value) => normalizeDrillSize(value))
// Optional: only practice this node and its sub-branches (?nodeId= on the drill page).
const nodeId = z.uuid('Invalid root id').optional()
// Review mode (?review=1): mix fully mastered (5/5) items back into the round. Off by default.
const includeMastered = z.boolean().default(false)

// Either a deck id or a slug (same slug rules as decks/dto/GetDeckBySlugDto), plus optional nodeId.
export const GetDrillSessionDto = z.union([
  z.object({ deckId: z.uuid('Invalid deck id'), nodeId, limit, includeMastered }),
  z.object({
    slug: z
      .string()
      .trim()
      .min(1, 'Slug is required')
      .max(160, 'Slug is too long')
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
    nodeId,
    limit,
    includeMastered,
  }),
])

export type GetDrillSessionInput = z.infer<typeof GetDrillSessionDto>

// A Mind Tournament round (/deck/[slug]/tournament): the whole tree, or one root and its sub-roots
// (rootId). Mastered items rest.
export const GetTournamentSessionDto = z.object({
  slug: z
    .string()
    .trim()
    .min(1, 'Slug is required')
    .max(160, 'Slug is too long')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug must be kebab-case'),
  rootId: z.uuid('Invalid root id').optional(),
  limit,
})

export type GetTournamentSessionInput = z.infer<typeof GetTournamentSessionDto>
