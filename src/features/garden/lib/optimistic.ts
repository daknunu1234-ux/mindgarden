// Optimistic farm edits (pure, unit-tested). The farm shows a change the moment the player makes it:
// each edit is an op laid over the placements the server last sent; its server action runs in the
// background. On success the op stays (an add learns its real id); on failure it is dropped, which
// rolls the farm back. When fresh placements arrive from the server, the ops are discarded (they are
// in the data by then).
import { treeBuff } from './farmBuffs'
import { withMoved, type Placement } from './farmGrid'

export type FarmOp =
  | { key: string; kind: 'add'; placement: Placement }
  | { key: string; kind: 'move'; id: string; to: { x: number; y: number } }
  | { key: string; kind: 'remove'; id: string }
  // A tree chopped down (its deck deleted): its tile goes, and it doesn't return to the Shop.
  | { key: string; kind: 'chop'; deckId: string }

// Id of a placement the server hasn't confirmed yet (nothing can be moved or picked up until it is).
export const PENDING_PREFIX = 'pending-'
export const isPendingId = (id: string): boolean => id.startsWith(PENDING_PREFIX)

// The farm as the player sees it: the server's placements with every op applied, in order.
export function applyOps(placements: readonly Placement[], ops: readonly FarmOp[]): Placement[] {
  let farm = [...placements]
  for (const op of ops) {
    if (op.kind === 'add') farm = [...farm.filter((p) => p.id !== op.placement.id), op.placement]
    else if (op.kind === 'move') farm = withMoved(farm, op.id, op.to)
    else if (op.kind === 'remove') farm = farm.filter((p) => p.id !== op.id)
    else farm = farm.filter((p) => !(p.itemType === 'tree' && p.deckId === op.deckId))
  }
  return farm
}

// Server confirmed an add: the pending placement takes its real id.
export const confirmAdd = (ops: readonly FarmOp[], key: string, realId: string): FarmOp[] =>
  ops.map((op) => (op.key === key && op.kind === 'add' ? { ...op, placement: { ...op.placement, id: realId } } : op))

// Server refused: drop the op (and with it the change).
export const rollback = (ops: readonly FarmOp[], key: string): FarmOp[] => ops.filter((op) => op.key !== key)

// Trees chopped on this visit: gone from the farm and from the Shop's Trees tab.
export const choppedDecks = (ops: readonly FarmOp[]): Set<string> => new Set(ops.flatMap((op) => (op.kind === 'chop' ? [op.deckId] : [])))

type TreeLike = { id: string; isOwner: boolean; placementId?: string | null; buff?: number }

// Split the gardener's trees by the farm as shown: planted ones get their tile (placement id) and coin
// buff; the owner's others wait in the Shop's Trees tab.
export function splitTrees<T extends TreeLike>(trees: readonly T[], farm: readonly Placement[]): { planted: T[]; unplanted: T[] } {
  const tiles = new Map(farm.filter((p) => p.itemType === 'tree' && p.deckId).map((p) => [p.deckId!, p]))
  const planted: T[] = []
  const unplanted: T[] = []
  for (const tree of trees) {
    const tile = tiles.get(tree.id)
    if (tile) planted.push({ ...tree, placementId: tile.id, buff: treeBuff(tile.x, tile.y, farm).multiplier })
    else if (tree.isOwner) unplanted.push({ ...tree, placementId: null, buff: 1 })
  }
  return { planted, unplanted }
}
