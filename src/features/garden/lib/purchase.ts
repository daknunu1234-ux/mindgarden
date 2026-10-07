// The new-tree flow on the farm (pure, tested): buy a seed in the Shop → place it on the island →
// name it → grow it in the Tree Workshop. These helpers shape the farm's view of a tree that was
// just bought, before the page's next render brings it from the server.
import type { FarmPlotView } from '../types'

export type BoughtTree = { id: string; slug: string; title: string; treeType: string }

// A tree just bought: the owner's, empty (nothing to water, no fruit, never withered), not on the
// farm yet (it waits in the Shop's Trees tab until it is placed).
export function boughtTreeView(tree: BoughtTree): FarmPlotView {
  return {
    ...tree,
    masteryPercent: 0,
    itemCount: 0,
    masteredCount: 0,
    mightyRoots: 0,
    needsWater: false,
    wateredDay: null,
    isOwner: true,
    placementId: null,
    buff: 1,
    withered: false,
    fruitReady: false,
  }
}

// Where the flow ends: the tree's page, the Workshop opening on its first root (`?start=1`).
export const workshopHref = (slug: string): string => `/deck/${slug}?start=1`

// The farm's trees with this visit's changes laid over the server's: trees bought on this visit
// (the server's own copy wins once it arrives) and new names (the latest rename wins).
export function withLocalTrees(server: readonly FarmPlotView[], bought: readonly FarmPlotView[], names: ReadonlyMap<string, string>): FarmPlotView[] {
  const byId = new Map<string, FarmPlotView>()
  for (const tree of [...bought, ...server]) byId.set(tree.id, tree)
  return [...byId.values()].map((tree) => {
    const name = names.get(tree.id)
    return name !== undefined && name !== tree.title ? { ...tree, title: name } : tree
  })
}
