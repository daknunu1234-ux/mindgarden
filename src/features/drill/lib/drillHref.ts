// URL of a practice round (pure). `review` = include mastered 5/5 items ("Review Mastered 🌿").
export function drillHref(slug: string, { nodeId, review = false }: { nodeId?: string; review?: boolean } = {}): string {
  const params = new URLSearchParams()
  if (nodeId) params.set('nodeId', nodeId)
  if (review) params.set('review', '1')
  const query = params.toString()
  return `/deck/${slug}/drill${query ? `?${query}` : ''}`
}

// Reads ?review= from the drill page: only "1" / "true" turn review mode on.
export const isReviewParam = (value: string | string[] | undefined): boolean => value === '1' || value === 'true'
