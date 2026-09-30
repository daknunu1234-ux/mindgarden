import type { RootNodeView } from '../types'
import type { MindmapDraftSlot } from './mindmapLayout'

// Fast-entry keyboard flow for the mindmap's quick-add input (pure, unit-tested). The page commits
// the typed text first (a root, sub-root or statement), then asks where the input goes next:
//   Enter      → a sibling input of the same kind (empty Enter closes the input)
//   Tab        → nest: under the root just typed (a statement), or from a statement to a new
//                sub-root under the same root
//   Shift+Tab  → up one level: a new root / sub-root beside the current one's parent
// null = close the input.

export type QuickAddKey = 'enter' | 'tab' | 'shift-tab'

export const QUICK_ADD_LIMITS = { node: 150, statement: 500 } as const

// Which quick-add key a keyboard event is (null for any other key, or while an IME is composing:
// Vietnamese Telex / VNI input commits its letters with Enter-like keys).
export function quickAddKey(e: { key: string; shiftKey: boolean; isComposing?: boolean }): QuickAddKey | null {
  if (e.isComposing) return null
  if (e.key === 'Enter' && !e.shiftKey) return 'enter'
  if (e.key === 'Tab') return e.shiftKey ? 'shift-tab' : 'tab'
  return null
}

// Node id → its parent id (null at the top level), for "up one level".
export function parentIndex(roots: readonly RootNodeView[]): Map<string, string | null> {
  const out = new Map<string, string | null>()
  const walk = (nodes: readonly RootNodeView[], parent: string | null) =>
    nodes.forEach((n) => {
      out.set(n.id, parent)
      walk(n.children, n.id)
    })
  walk(roots, null)
  return out
}

// The slot for a new node beside `nodeId` (its sibling): a root at the top level, else a sub-root.
function besideNode(nodeId: string, parents: ReadonlyMap<string, string | null>): MindmapDraftSlot | null {
  const parent = parents.get(nodeId)
  if (parent === undefined) return null
  return parent === null ? { kind: 'root' } : { kind: 'branch', parentId: parent }
}

// Where the input goes after `key`. `typed` = there was text (it has just been committed);
// `createdId` = the node that text created (roots / sub-roots only).
export function nextQuickSlot(
  slot: MindmapDraftSlot,
  key: QuickAddKey,
  typed: boolean,
  createdId: string | null,
  parents: ReadonlyMap<string, string | null>,
): MindmapDraftSlot | null {
  switch (key) {
    case 'enter':
      return typed ? slot : null
    case 'tab':
      if (slot.kind === 'statement') return { kind: 'branch', parentId: slot.nodeId }
      // Nest under the node just typed; with nothing typed there is nothing to nest under yet.
      return createdId ? { kind: 'statement', nodeId: createdId } : slot
    case 'shift-tab':
      if (slot.kind === 'root') return slot
      if (slot.kind === 'statement') return besideNode(slot.nodeId, parents)
      return besideNode(slot.parentId, parents)
  }
}

// Placeholder and screen-reader label for the input.
export function quickAddPrompt(slot: MindmapDraftSlot, titleOf: (id: string) => string | undefined): { placeholder: string; label: string } {
  switch (slot.kind) {
    case 'root':
      return { placeholder: 'New root…', label: 'New top-level root' }
    case 'branch':
      return { placeholder: 'New sub-root…', label: `New sub-root under ${titleOf(slot.parentId) ?? 'this root'}` }
    case 'statement':
      return { placeholder: 'New statement…', label: `New statement under ${titleOf(slot.nodeId) ?? 'this root'}` }
  }
}

// The slot with its root's id mapped through `resolve` (a temp id → the real one once saved), so an
// open input stays under its root when the save confirms. Unchanged slots keep their identity.
export function resolveSlot(slot: MindmapDraftSlot, resolve: (id: string) => string): MindmapDraftSlot {
  if (slot.kind === 'root') return slot
  if (slot.kind === 'branch') {
    const parentId = resolve(slot.parentId)
    return parentId === slot.parentId ? slot : { kind: 'branch', parentId }
  }
  const nodeId = resolve(slot.nodeId)
  return nodeId === slot.nodeId ? slot : { kind: 'statement', nodeId }
}
