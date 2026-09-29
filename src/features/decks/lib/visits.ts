// Visited Gardens rule (pure, unit-tested; record_tree_visit() in migration 20260928000800 enforces
// the same in the database): opening a tree counts as a visit only for a signed-in player, on
// ANOTHER gardener's PUBLIC tree. Your own trees and private trees never count.
export function countsAsVisit({ viewerId, ownerId, isPublic }: { viewerId: string | null; ownerId: string; isPublic: boolean }): boolean {
  return viewerId !== null && viewerId !== ownerId && isPublic
}
