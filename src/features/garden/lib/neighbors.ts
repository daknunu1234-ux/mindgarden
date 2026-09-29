// Visited Gardens (pure, unit-tested): the shared trees a player has opened, grouped into
// neighbour gardens.
// Neighbours are named with shared/lib/neighborName (profiles aren't readable across players).

import { neighborName, publicName } from '@/shared/lib/neighborName'

export { neighborName, publicName }

// One visited tree, as the page passes it in (from decks' getVisitedGardens).
export type VisitedTreeView = {
  deckId: string
  ownerId: string
  slug: string
  title: string
  treeType: string
  // null when the count couldn't be read.
  statementCount: number | null
  visitedAt: string
}

export type VisitedGarden = {
  ownerId: string
  name: string
  // The newest visit to any of this gardener's trees.
  lastVisitedAt: string
  trees: Omit<VisitedTreeView, 'ownerId'>[]
}

// Groups visited trees by gardener, never including the viewer's own trees: the most recently
// visited garden first, and inside each garden the most recently visited tree first. A tree listed
// twice keeps its newest visit.
// `names` = gardeners' chosen display names by id (auth's getDisplayNames); anyone without one
// shows as their pseudonym.
export function groupVisitedGardens(
  trees: readonly VisitedTreeView[],
  viewerId: string | null,
  names: Readonly<Record<string, string>> = {},
): VisitedGarden[] {
  const newest = new Map<string, VisitedTreeView>()
  for (const t of trees) {
    if (t.ownerId === viewerId) continue
    const seen = newest.get(t.deckId)
    if (!seen || t.visitedAt > seen.visitedAt) newest.set(t.deckId, t)
  }

  const byOwner = new Map<string, VisitedTreeView[]>()
  for (const t of newest.values()) byOwner.set(t.ownerId, [...(byOwner.get(t.ownerId) ?? []), t])

  return [...byOwner.entries()]
    .map(([ownerId, list]) => {
      const sorted = [...list].sort((a, b) => b.visitedAt.localeCompare(a.visitedAt))
      return {
        ownerId,
        name: publicName(names[ownerId], ownerId),
        lastVisitedAt: sorted[0].visitedAt,
        trees: sorted.map((t) => ({
          deckId: t.deckId,
          slug: t.slug,
          title: t.title,
          treeType: t.treeType,
          statementCount: t.statementCount,
          visitedAt: t.visitedAt,
        })),
      }
    })
    .sort((a, b) => b.lastVisitedAt.localeCompare(a.lastVisitedAt))
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
// Fixed names: Intl month abbreviations differ between ICU versions ("Sep" / "Sept").
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then the date ("12 Sep 2026").
// `now` is passed in so the result is deterministic (and the same on server and client).
export function formatVisitedAgo(visitedAt: string, now: number): string {
  const at = Date.parse(visitedAt)
  if (Number.isNaN(at)) return ''
  const diff = Math.max(0, now - at)
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`
  const days = Math.floor(diff / DAY)
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  const d = new Date(at)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

// Farm URL for visiting a neighbour's island (read-only visitor mode).
export const visitHref = (ownerId: string): string => `/?visit=${encodeURIComponent(ownerId)}`
