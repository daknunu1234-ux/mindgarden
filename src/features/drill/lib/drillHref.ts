import type { DrillSize } from './drillSize'

// URL of a practice round (pure). `rootId` = one root and its sub-roots (the whole tree without it).
// `review` = include mastered 5/5 items ("Review Mastered 🌿"). `limit` = round size; without it the
// page uses the saved choice (cookie) or 10. Pages still accept the old ?nodeId= for a root.
export function drillHref(
  slug: string,
  { rootId, review = false, limit }: { rootId?: string; review?: boolean; limit?: DrillSize } = {},
): string {
  const params = new URLSearchParams()
  if (rootId) params.set('rootId', rootId)
  if (review) params.set('review', '1')
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  return `/deck/${slug}/drill${query ? `?${query}` : ''}`
}

// URL of a Mind Tournament round on someone else's tree: the whole tree, or one root (`rootId`).
export function tournamentHref(slug: string, { rootId, limit }: { rootId?: string; limit?: DrillSize } = {}): string {
  const params = new URLSearchParams()
  if (rootId) params.set('rootId', rootId)
  if (limit) params.set('limit', String(limit))
  const query = params.toString()
  return `/deck/${slug}/tournament${query ? `?${query}` : ''}`
}

// ?rootId= (or the older ?nodeId=) from a round page: one non-empty string, else the whole tree.
export function rootParam(rootId: string | string[] | undefined, nodeId?: string | string[] | undefined): string | undefined {
  const pick = (v: string | string[] | undefined) => (typeof v === 'string' && v !== '' ? v : undefined)
  return pick(rootId) ?? pick(nodeId)
}

// Reads ?review= from the drill page: only "1" / "true" turn review mode on.
export const isReviewParam = (value: string | string[] | undefined): boolean => value === '1' || value === 'true'
