// Community Gardens (pure, unit-tested): shared trees grouped into neighbour gardens.
//
// Players can't read each other's profiles (users RLS: self only), so a neighbour is shown with a
// friendly name derived from their id: stable for everyone, reveals nothing personal.

const ADJECTIVES = ['Sunny', 'Mossy', 'Breezy', 'Dewy', 'Golden', 'Misty', 'Cheery', 'Leafy', 'Rosy', 'Starry', 'Maple', 'Clover']
const CREATURES = ['Otter', 'Robin', 'Hedgehog', 'Fox', 'Bunny', 'Owl', 'Wren', 'Badger', 'Finch', 'Squirrel', 'Deer', 'Duckling']

function hash(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// "Mossy Owl" for a given gardener id, the same on every page and for every visitor.
export function neighborName(ownerId: string): string {
  const h = hash(ownerId)
  return `${ADJECTIVES[h % ADJECTIVES.length]} ${CREATURES[Math.floor(h / ADJECTIVES.length) % CREATURES.length]}`
}

export type SharedTree = { id: string; slug: string; title: string; treeType: string; userId: string; createdAt: string }

export type NeighborGarden = {
  ownerId: string
  name: string
  trees: Omit<SharedTree, 'userId'>[]
}

// Groups shared trees by owner, never including the viewer's own trees; gardens with the newest
// tree first, trees newest first inside each garden.
export function groupNeighborGardens(trees: readonly SharedTree[], viewerId: string | null): NeighborGarden[] {
  const byOwner = new Map<string, SharedTree[]>()
  for (const t of trees) {
    if (t.userId === viewerId) continue
    byOwner.set(t.userId, [...(byOwner.get(t.userId) ?? []), t])
  }
  return [...byOwner.entries()]
    .map(([ownerId, list]) => ({
      ownerId,
      name: neighborName(ownerId),
      trees: [...list]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map((t) => ({ id: t.id, slug: t.slug, title: t.title, treeType: t.treeType, createdAt: t.createdAt })),
    }))
    .sort((a, b) => b.trees[0].createdAt.localeCompare(a.trees[0].createdAt))
}

// Farm URL for visiting a neighbour's island (read-only visitor mode).
export const visitHref = (ownerId: string): string => `/?visit=${encodeURIComponent(ownerId)}`
