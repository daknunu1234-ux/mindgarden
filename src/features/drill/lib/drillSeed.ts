import { hashString } from '@/shared/utils/seededRandom'

// seed = hash(itemId + sessionId), backend/ARCHITECTURE.md §7. Base36, at most 7 chars.
export const drillSeed = (itemId: string, sessionId: string): string =>
  hashString(`${itemId}:${sessionId}`).toString(36)
