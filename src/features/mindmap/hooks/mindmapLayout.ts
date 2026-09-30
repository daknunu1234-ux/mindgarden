import type { RootNodeView } from '../types'

// Mindmap layout (pure, unit-tested). The crown sits under the tree trunk; level-1 roots
// (categories) spread in a row beneath it; each category's statements and sub-branches stack in
// a column below it, indented by depth. Columns are as wide as their widest card and never share
// x-ranges, so cards cannot overlap however many nodes or items exist. Compact on purpose: small
// cards, tight gaps and micro-badges, so a big tree still reads at a glance.

export const CROWN_Y = 34
export const CARD = {
  // Pills hold: mastery ring, title, statement-count micro-badge, collapse chip; top-level roots
  // also hold the 💧 / ⚔️ practice button. Owner tools float above on hover.
  category: { w: 236, h: 38 },
  branch: { w: 204, h: 32 },
  statement: { w: 200, h: 54 },
} as const
const INDENT = 22
const GAP_Y = 8
const COL_GAP = 28
const TOP = CROWN_Y + 48
const PAD = 16

// Where the owner's quick-add input sits: a new top-level root (a column at the end of the row), a
// sub-root at the end of a branch, or a statement after a root's statements (before its sub-roots).
export type MindmapDraftSlot = { kind: 'root' } | { kind: 'branch'; parentId: string } | { kind: 'statement'; nodeId: string }

// The quick-add input takes the size of what it will become.
const DRAFT_SIZE = { root: CARD.category, branch: CARD.branch, statement: CARD.statement } as const

export const DRAFT_KEY = 'draft'

export type MindmapCardKind = keyof typeof CARD | 'draft'

export type MindmapCard = {
  key: string
  kind: MindmapCardKind
  // The mindmap node this card is (category / branch) or belongs to (statement).
  nodeId: string
  itemId: string | null
  parentKey: string | null
  depth: number
  x: number
  y: number
  w: number
  h: number
  title: string
  // Statement cards: 1-based position within their root, for "Statement 2" labels.
  ordinal: number | null
  // Category / branch cards: has anything to collapse, and how many cards are hidden now.
  collapsible: boolean
  hiddenCount: number
  // Draft cards only: what the quick-add input creates.
  draft?: MindmapDraftSlot
}

// from = null: the edge starts at the crown.
export type MindmapEdge = { from: string | null; to: string; path: string; x1: number; y1: number; x2: number; y2: number }

export type MindmapLayout = {
  cards: MindmapCard[]
  edges: MindmapEdge[]
  // trunk: where the tree meets the ground (y = 0). crown: end of the main conduit.
  trunk: { x: number; y: number }
  crown: { x: number; y: number }
  width: number
  height: number
}

export const nodeKey = (id: string) => `n:${id}`
export const itemKey = (id: string) => `i:${id}`

// Everything below a node: its statements and all sub-branches with their statements.
export function countDescendantCards(node: RootNodeView): number {
  return node.items.length + node.children.reduce((sum, c) => sum + 1 + countDescendantCards(c), 0)
}

// The prompt is shown when it says something new; app-authored items reuse the root title as
// their prompt, so they become "Statement 1, 2, …". (Statement text itself is the answer: never shown.)
// What a statement card / the inspector shows: the statement itself whenever the page passes it
// (owner and visitors alike); "Statement n" only when the text is genuinely missing or blank.
export function statementLabel(text: string | null | undefined, prompt: string | undefined, nodeTitle: string, ordinal: number): string {
  const t = text?.trim()
  return t ? t : statementTitle(prompt, nodeTitle, ordinal)
}

export function statementTitle(prompt: string | undefined, nodeTitle: string, ordinal: number): string {
  const p = prompt?.trim()
  return p && p.toLocaleLowerCase() !== nodeTitle.trim().toLocaleLowerCase() ? p : `Statement ${ordinal}`
}

// `draft`: the owner's open quick-add input, laid out like the card it will become (with its root
// line), so typing never covers another card. A slot under a collapsed or unknown node is left out.
export function layoutMindmap(
  roots: RootNodeView[],
  collapsed: ReadonlySet<string> = new Set(),
  draft: MindmapDraftSlot | null = null,
): MindmapLayout {
  const cards: MindmapCard[] = []
  let colX = PAD

  // Pushes the draft card; returns the height it takes.
  const draftCard = (slot: MindmapDraftSlot, parentKey: string | null, depth: number, x: number, y: number): number => {
    const size = DRAFT_SIZE[slot.kind]
    cards.push({
      key: DRAFT_KEY,
      kind: 'draft',
      nodeId: slot.kind === 'root' ? '' : slot.kind === 'branch' ? slot.parentId : slot.nodeId,
      itemId: null,
      parentKey,
      depth,
      x,
      y,
      ...size,
      title: '',
      ordinal: null,
      collapsible: false,
      hiddenCount: 0,
      draft: slot,
    })
    return size.h
  }

  const nodeCard = (node: RootNodeView, kind: 'category' | 'branch', parentKey: string | null, depth: number, x: number, y: number) => {
    const isCollapsed = collapsed.has(node.id)
    const card: MindmapCard = {
      key: nodeKey(node.id),
      kind,
      nodeId: node.id,
      itemId: null,
      parentKey,
      depth,
      x,
      y,
      ...CARD[kind],
      title: node.title,
      ordinal: null,
      collapsible: node.items.length + node.children.length > 0,
      hiddenCount: isCollapsed ? countDescendantCards(node) : 0,
    }
    cards.push(card)
    return card
  }

  // Lays out a node's content below `cursor`; returns the next free y.
  const place = (node: RootNodeView, parent: MindmapCard, depth: number, colLeft: number, cursor: number): number => {
    if (collapsed.has(node.id)) return cursor
    const x = colLeft + depth * INDENT
    node.items.forEach((item, i) => {
      cards.push({
        key: itemKey(item.id),
        kind: 'statement',
        nodeId: node.id,
        itemId: item.id,
        parentKey: parent.key,
        depth,
        x,
        y: cursor,
        ...CARD.statement,
        title: statementTitle(item.prompt, node.title, i + 1),
        ordinal: i + 1,
        collapsible: false,
        hiddenCount: 0,
      })
      cursor += CARD.statement.h + GAP_Y
    })
    if (draft?.kind === 'statement' && draft.nodeId === node.id) cursor += draftCard(draft, parent.key, depth, x, cursor) + GAP_Y
    for (const child of node.children) {
      const card = nodeCard(child, 'branch', parent.key, depth, x, cursor)
      cursor = place(child, card, depth + 1, colLeft, cursor + CARD.branch.h + GAP_Y)
    }
    if (draft?.kind === 'branch' && draft.parentId === node.id) cursor += draftCard(draft, parent.key, depth, x, cursor) + GAP_Y
    return cursor
  }

  for (const root of roots) {
    const category = nodeCard(root, 'category', null, 0, colX, TOP)
    const first = cards.length - 1
    place(root, category, 1, colX, TOP + CARD.category.h + GAP_Y + 4)
    const right = Math.max(...cards.slice(first).map((c) => c.x + c.w))
    colX = right + COL_GAP
  }
  // A new top-level root: its own column at the end of the row (the crown stays over the real roots).
  if (draft?.kind === 'root') draftCard(draft, null, 0, colX, TOP)

  const categories = cards.filter((c) => c.kind === 'category')
  const centres = categories.map((c) => c.x + c.w / 2)
  const trunkX = centres.length > 0 ? (centres[0] + centres[centres.length - 1]) / 2 : PAD + CARD.category.w / 2
  const trunk = { x: trunkX, y: 0 }
  const crown = { x: trunkX, y: CROWN_Y }

  const byKey = new Map(cards.map((c) => [c.key, c]))
  const edges: MindmapEdge[] = cards.map((c) => {
    const parent = c.parentKey ? byKey.get(c.parentKey) : undefined
    if (!parent) {
      // Crown → category: vertical S-curve into the top of the pill.
      const x2 = c.x + c.w / 2
      const y2 = c.y
      const my = (crown.y + y2) / 2
      return { from: null, to: c.key, path: `M ${crown.x} ${crown.y} C ${crown.x} ${my}, ${x2} ${my}, ${x2} ${y2}`, x1: crown.x, y1: crown.y, x2, y2 }
    }
    // Parent's port (under its left edge) → child's left port: an organic elbow.
    const x1 = parent.x + INDENT * 0.6
    const y1 = parent.y + parent.h
    const x2 = c.x
    const y2 = c.y + c.h / 2
    const path = `M ${x1} ${y1} C ${x1} ${y1 + (y2 - y1) * 0.8}, ${x1 + (x2 - x1) * 0.2} ${y2}, ${x2} ${y2}`
    return { from: parent.key, to: c.key, path, x1, y1, x2, y2 }
  })

  return {
    cards,
    edges,
    trunk,
    crown,
    width: cards.length > 0 ? Math.max(...cards.map((c) => c.x + c.w)) + PAD : PAD * 2 + CARD.category.w,
    height: cards.length > 0 ? Math.max(...cards.map((c) => c.y + c.h)) + PAD : 0,
  }
}

// Keys from a card up to its category (inclusive), to light the path back to the crown.
export function ancestorKeys(layout: MindmapLayout, key: string | null): Set<string> {
  const parentOf = new Map(layout.cards.map((c) => [c.key, c.parentKey]))
  const path = new Set<string>()
  let current = key
  while (current && !path.has(current)) {
    path.add(current)
    current = parentOf.get(current) ?? null
  }
  return path
}

// Every card below a node card (for lighting its child connections in the inspector).
export function descendantKeys(layout: MindmapLayout, key: string | null): Set<string> {
  const children = new Map<string, string[]>()
  for (const c of layout.cards) if (c.parentKey) children.set(c.parentKey, [...(children.get(c.parentKey) ?? []), c.key])
  const out = new Set<string>()
  const stack = key ? [...(children.get(key) ?? [])] : []
  while (stack.length > 0) {
    const k = stack.pop()!
    if (out.has(k)) continue
    out.add(k)
    stack.push(...(children.get(k) ?? []))
  }
  return out
}

// Ids of a node and every root under it (inspect expands the whole branch).
export function branchNodeIds(node: RootNodeView): string[] {
  return [node.id, ...node.children.flatMap(branchNodeIds)]
}
