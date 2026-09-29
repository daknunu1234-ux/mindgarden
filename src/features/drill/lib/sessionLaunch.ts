// What the session launch pop-up shows and where it goes (pure, unit-tested). The same plan serves
// every trigger: "Water Tree" / "⚔️ Join Mind Tournament" on the whole tree and "Drill Root" / "Compete Root"
// on one root (mindmap cards, root inspector, the visitor's tree list).
import { isMastered } from '@/shared/lib/mastery'
import { collectBranch } from './branch'
import { drillHref, tournamentHref } from './drillHref'
import type { DrillSize } from './drillSize'

// 'drill' = watering your own tree (user_progress); 'compete' = Mind Tournament (tournament progress).
export type LaunchMode = 'drill' | 'compete'
export type LaunchNode = { id: string; parentId: string | null; title: string }
// drillable: the trap engine can build a question (others are skipped by every round).
export type LaunchItem = { id: string; nodeId: string; drillable: boolean }

export type LaunchContext = {
  mode: LaunchMode
  slug: string
  nodes: readonly LaunchNode[]
  items: readonly LaunchItem[]
  // The mode's own levels: the owner's mastery for 'drill', the contestant's tournament levels for 'compete'.
  levels: Readonly<Record<string, number>>
}

// No rootId = the whole tree. review (watering only) mixes 5/5 statements back in.
export type LaunchRequest = { rootId?: string; review?: boolean }

export type LaunchPlan = {
  mode: LaunchMode
  // "Water Tree 🌱 - Whole Tree" / "Compete ⚔️ - Root: <name>"
  title: string
  modeLabel: string
  scopeLabel: string
  rootId: string | null
  review: boolean
  // Questions a round in this scope can ask: drillable statements, minus the mode's 5/5 ones unless reviewing.
  available: number
  href: (size: DrillSize) => string
}

export const WHOLE_TREE_LABEL = 'Whole Tree'

// null when the root isn't part of this tree.
export function planLaunch(context: LaunchContext, { rootId, review = false }: LaunchRequest = {}): LaunchPlan | null {
  const { mode, slug, nodes, items, levels } = context
  const root = rootId ? nodes.find((n) => n.id === rootId) : undefined
  if (rootId && !root) return null

  const reviewing = mode === 'drill' && review
  const inScope = root ? collectBranch(nodes, root.id) : null
  const available = items.filter((i) => i.drillable && (!inScope || inScope.has(i.nodeId)) && (reviewing || !isMastered(levels[i.id]))).length

  const modeLabel = mode === 'drill' ? (reviewing ? 'Review 🌿' : 'Water Tree 🌱') : 'Compete ⚔️'
  const scopeLabel = root ? `Root: ${root.title}` : WHOLE_TREE_LABEL
  return {
    mode,
    title: `${modeLabel} - ${scopeLabel}`,
    modeLabel,
    scopeLabel,
    rootId: root?.id ?? null,
    review: reviewing,
    available,
    href: (size) =>
      mode === 'drill'
        ? drillHref(slug, { rootId: root?.id, review: reviewing, limit: size })
        : tournamentHref(slug, { rootId: root?.id, limit: size }),
  }
}

// Flattens a nested deck tree (roots with children and items) into launch nodes and items.
// `drillable` comes from the editor / reader lists (item id → flag); unknown items count as drillable.
export function launchPool(
  tree: readonly { id: string; title: string; items: readonly { id: string }[]; children: readonly unknown[] }[],
  drillable?: ReadonlyMap<string, boolean>,
): { nodes: LaunchNode[]; items: LaunchItem[] } {
  type TreeNode = { id: string; title: string; items: readonly { id: string }[]; children: readonly unknown[] }
  const nodes: LaunchNode[] = []
  const items: LaunchItem[] = []
  const walk = (list: readonly TreeNode[], parentId: string | null) => {
    for (const n of list) {
      nodes.push({ id: n.id, parentId, title: n.title })
      for (const item of n.items) items.push({ id: item.id, nodeId: n.id, drillable: drillable?.get(item.id) ?? true })
      walk(n.children as readonly TreeNode[], n.id)
    }
  }
  walk(tree, null)
  return { nodes, items }
}
